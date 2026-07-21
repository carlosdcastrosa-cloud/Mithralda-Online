// CAS-2763 — self-verify for TEMPLE (DARK, PARTY_VITAL_SURGE.enabled:false). EVO mecánica #132 (base master 472dd92 tras #131 AGGRO_VIGOR LIVE&served a05466f6d03e/815) — EJE FRESCO + CANAL FRESCO, ⊥ a las 73 LIVE #59-#131. El 14º eje de COMPOSICIÓN-DE-INTENCIÓN y CIERRA la sub-familia HP-STATE con el LADO ALIADO: cuánta pelea LE QUEDA a la PARTY de JUGADORES (su SALUD RESTANTE — un DATO que ningún prior lee). #131 VIGOR abrió HP-STATE leyendo el HP del ENEMIGO; TEMPLE lee el HP del JUGADOR (espejo-pero-ortogonal), como #129 SURROUND (ANGULAR)+#130 PRESSURE (RADIAL) fueron los dos componentes de la POSICIÓN.
// (A) EJE FRESCO = TEMPLE/ALLY-HP-STATE = partyVitalField(hero) = W = mean(hp/hpMax) sobre los JUGADORES VIVOS en radio (requiere pack ENGANCHADO presente, N≥minMobs). SNAPSHOT PURO (lee hero+player hp directo, SIN buffer temporal, como #129/#130/#131). 🔑 DETERMINISMO (sev-1): hp/hpMax ENTEROS ⇒ nivel-de-HP CUANTIZADO a niveles ENTEROS (vitBins 64) vía comparación ENTERA hp·Q ≥ L·hpMax; banda por comparación de sumas ENTERAS (0-float division en el score/decisión). Bandas sobre W: ≥hiVital(0.75) ⇒ sana ⇒ 2; ≥midVital(0.5) ⇒ media-sana ⇒ 1; <mid (maltrecha) ⇒ 0. Requiere ≥minMobs(3) y ≥minPlayers(2). 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ P<2 ⇒ W=0 (colapso LIMPIO).
// (B) CANAL FRESCO = partyVitalFind (fichas de temple por comprometer/rematar con la PARTY SANA — NINGUNA de las 73 flags lo usa). Moneda FRESCA (h.partyVitalBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — ALLY-HP-STATE ⊥ TODOS los priores: ⊥#131 VIGOR (MOB-HP-STATE): VIGOR lee HP del ENEMIGO, TEMPLE lee HP del JUGADOR — battered-party/fresh-pack (W lo/V hi) vs healthy-party/battered-pack (W hi/V lo), MISMA pelea sujeto OPUESTO ⊥#130 PRESSURE (RADIAL: position-invariant) ⊥#126 DENSITY (magnitud: W invariante a P y N).
//
// Run: node tools/cas2763-partyvital-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2763");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// vitalProbe LUT esperada: (fracs=HP jugadores ∈[0,1], mobs=N gate)→P=len→Σ nivel-HP ENTERO (hp=round(frac·1000))→W=sum/(P·Q)→banda(sumas ENTERAS)→{weight,tier}. UMBRALES hiVital 0.75 / midVital 0.5 + colapso single-player (P<2 ⇒ 0) + minMobs (N<3 ⇒ 0). Q=64, HM=1000. Casos ELEGIDOS lejos de los umbrales.
const EXPECT_VITAL = [
  { name: "fresh-party-P2",   fracs: [1, 1],              mobs: 4, w: 2 },   // party P2 a full-HP ⇒ W=1 ⇒ sana ⇒ 2
  { name: "battered-party-P2",fracs: [0.1, 0.1],          mobs: 4, w: 0 },   // party P2 casi-muerta (10% HP) ⇒ W≈0.09 ⇒ maltrecha ⇒ 0 (MISMO pack, party OPUESTA)
  { name: "some-party-P2",    fracs: [0.6, 0.6],          mobs: 4, w: 1 },   // party P2 al 60% ⇒ W≈0.59 ⇒ media-sana ⇒ 1
  { name: "trio-fresh-P3",    fracs: [0.95, 0.95, 0.95],  mobs: 3, w: 2 },   // party P3 al 95% ⇒ W≈0.94 ⇒ 2
  { name: "quad-battered-P4", fracs: [0.15, 0.15, 0.15, 0.15], mobs: 4, w: 0 }, // party P4 al 15% ⇒ W≈0.14 ⇒ 0
  { name: "no-pack-N2",       fracs: [1, 1],              mobs: 2, w: 0 },   // 🔑 N2 <minMobs3 (sin pack enganchado) ⇒ degenerado ⇒ 0
  { name: "single-player",    fracs: [1],                 mobs: 4, w: 0 },   // 🔑 single-player (P1) ⇒ degenerado ⇒ 0 (colapso LIMPIO)
];
// driveVital REAL: inyecta party sintética (P jugadores con HP=round(frac·1000)) + mobs enganchados (gate N); W server-auth. Requiere ≥minMobs(3) y ≥minPlayers(2).
const EXPECT_DRIVE = [
  { name: "fresh-P2",    fracs: [1, 1],         mobs: 4, w: 2 },
  { name: "battered-P2", fracs: [0.1, 0.1],     mobs: 4, w: 0 },
  { name: "some-P2",     fracs: [0.6, 0.6],     mobs: 4, w: 1 },
  { name: "single-player", fracs: [1],          mobs: 4, w: 0 },   // 🔑 P1 (sólo un jugador) ⇒ 0
  { name: "no-pack-N2",  fracs: [1, 1],         mobs: 2, w: 0 },   // N2 <minMobs3 ⇒ 0
];
const PLAYER_OFF = [[0, 0], [44, 0], [0, 44], [-44, 0], [30, 30]];   // offsets de jugadores sintéticos (el [0,0] = posición del héroe; dentro de radio 300)
// mobPts: n mobs enganchados repartidos angularmente a dist fija (posición/HP del mob NO afectan W — temple lee sólo el HP de la party; los mobs son el gate N).
const mobPts = (n, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase" }));
// party: mapea fracs de jugador a party sintética {dx,dy,frac}.
const partyOf = (fracs) => fracs.map((frac, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1], frac }));

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.partyVital && window.__dev.aggroVigor && window.__dev.aggroPressure && window.__dev.aggroSurround && window.__dev.aggroDensity && window.__dev.aggroVariety && window.__dev.converge && window.__dev.aggroPile && window.__dev.aggroContest && window.__dev.targetSpread && window.__dev.aggroFocus && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.partyVital + peer hooks (aggroVigor/aggroPressure/aggroSurround/aggroDensity/aggroVariety/converge/aggroPile/aggroContest/targetSpread/aggroFocus) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.partyVital());
  ok("2 byte-id OFF (fresh boot): PARTY_VITAL_SURGE.enabled false AND G.partyVitalBounty NUNCA se crea (gExists false) AND G._vitParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.players === 0 && dark.engaged === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "partyVitalFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} engaged=${dark.engaged} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiVital=${dark.hiVital} midVital=${dark.midVital} vitBins=${dark.vitBins} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no partyVitalFind/partyVitalBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(partyVitalFind|partyVitalBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"partyVitalBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'partyVitalFind'/'partyVitalBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.partyVital({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.partyVital({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ vitalProbe LUT: (fracs=HP jugadores,mobs=N)→P→Σ HP ENTERA→W=sum/(P·Q)→banda(sumas ENTERAS)→tier→charge (UMBRALES hiVital/midVital + colapso single-player + minMobs).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.partyVital({ vitalProbe: { fracs: c.fracs, mobs: c.mobs } }).vitalProbe), EXPECT_VITAL);
  const tabOK = EXPECT_VITAL.every((c, i) => tab[i] && tab[i].weight === c.w);
  ok("5 ★ vitalProbe LUT (FRACCIÓN-DE-HP-de-la-PARTY W=mean(hp/hpMax)): fresh-party(f1)⇒W=1/w2, battered-party(f0.1)⇒W≈0.09/w0 (MISMO pack N4, party opuesta), some(f0.6)⇒w1, trio-fresh⇒w2, quad-battered⇒w0, no-pack⇒N2<minMobs⇒0, single-player⇒0. UMBRAL hiVital 0.75/midVital 0.5",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_VITAL[i].name, p: x.players, W: x.vital, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH TEMPLE: driveVital inyecta party sintética con HP dado + mobs (gate) ⇒ W REAL server-auth.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, PLAYER_OFF } = args;
    const mobPts = (n, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase" }));
    const partyOf = (fracs) => fracs.map((frac, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1], frac }));
    window.__dev.partyVital({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.partyVital({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.partyVital({ driveVital: { players: partyOf(c.fracs), pts: mobPts(c.mobs), wipe: true } }).driveVital;
      const live = window.__dev.partyVital({ vitalProbeLive: true }).vitalProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvEngaged: dv.engaged, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, engaged: live.engaged, livePlayers: live.players });
    }
    window.__dev.partyVital({ clearVital: true });
    window.__dev.partyVital({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w);
  ok("5b ★ REAL SERVER-AUTH TEMPLE (hero+player hp snapshot): fresh(P2)=w2, battered(P2)=w0, some(P2)=w1, single-player(P1)=0, no-pack(N2<minMobs)=0",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA) ⊥#131 VIGOR (ALLY-HP-STATE ⊥ MOB-HP-STATE): MISMA pelea (pack fresco vs pack maltrecho), pero TEMPLE lee la PARTY y VIGOR lee el MOB ⇒ DISOCIAN por SUJETO. battered-party/fresh-pack (W lo, V hi = peligro) vs healthy-party/battered-pack (W hi, V lo = limpieza).
  const cruxVig = await page.evaluate(() => {
    const vitW = (fracs, mobs) => window.__dev.partyVital({ vitalProbe: { fracs, mobs } }).vitalProbe.weight;
    const vigW = (fracs, P) => window.__dev.aggroVigor({ vigorProbe: { fracs, players: P } }).vigorProbe.weight;
    // battered-party (W lo) + fresh-pack (V hi) = "peligro": la party está herida frente a un pack a full-HP
    const dangerParty = vitW([0.1, 0.1], 4);   // party 2 al 10% ⇒ W lo ⇒ 0
    const dangerPack = vigW([1, 1, 1, 1], 2);   // pack 4 a full ⇒ V hi ⇒ 2
    // healthy-party (W hi) + battered-pack (V lo) = "limpieza": la party sana remata un pack casi-muerto
    const mopupParty = vitW([1, 1], 4);         // party 2 a full ⇒ W hi ⇒ 2
    const mopupPack = vigW([0.1, 0.1, 0.1, 0.1], 2);  // pack 4 al 10% ⇒ V lo ⇒ 0
    return { dangerParty, dangerPack, mopupParty, mopupPack };
  });
  const cruxVigOK = cruxVig.dangerParty === 0 && cruxVig.dangerPack === 2      // party maltrecha (TEMPLE 0) vs pack fresco (VIGOR 2)
    && cruxVig.mopupParty === 2 && cruxVig.mopupPack === 0;                    // party sana (TEMPLE 2) vs pack maltrecho (VIGOR 0)
  ok("6 ★ CRUX (LA CRÍTICA) ⊥#131 VIGOR (ALLY-HP-STATE ⊥ MOB-HP-STATE): battered-party/fresh-pack ⇒ TEMPLE 0/VIGOR 2 (peligro) vs healthy-party/battered-pack ⇒ TEMPLE 2/VIGOR 0 (limpieza) ⇒ DISOCIAN por SUJETO (TEMPLE lee HP del JUGADOR, VIGOR del ENEMIGO)",
     cruxVigOK, JSON.stringify(cruxVig));

  // 6b ★ CRUX ⊥#130 PRESSURE (ALLY-HP-STATE ⊥ RADIAL-POSICIÓN): MISMA party+HP a geometría de pack MUY distinta (pegado vs lejos) ⇒ MISMO W. TEMPLE es position-blind.
  const cruxPrs = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const partyOf = (fracs) => fracs.map((frac, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1], frac }));
    window.__dev.partyVital({ enabled: true });
    const drive = (dist) => { window.__dev.partyVital({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = [0, 90, 180, 270].map((deg) => ({ deg, dist, type: "rat", state: "chase" }));   // 4 mobs a dist dada (N4 gate)
      const dv = window.__dev.partyVital({ driveVital: { players: partyOf([1, 1]), pts, wipe: true } }).driveVital;   // party P2 fresca
      return { idx: dv.idx, score: dv.score, engaged: dv.engaged }; };
    const near = drive(30);      // pack pegado
    const far = drive(250);      // pack lejos — MISMA party (full-HP)
    window.__dev.partyVital({ clearVital: true });
    window.__dev.partyVital({ enabled: false });
    return { near, far };
  }, { Z, PLAYER_OFF });
  const cruxPrsOK = cruxPrs.near.score === cruxPrs.far.score && cruxPrs.near.idx === cruxPrs.far.idx && cruxPrs.near.score === 2 && cruxPrs.near.engaged === 4;
  ok("6b ★ CRUX ⊥#130 PRESSURE (ALLY-HP-STATE ⊥ RADIAL): MISMA party P2 full-HP con pack pegado (d30) vs lejos (d250) ⇒ MISMO W/score2 (TEMPLE lee sólo el HP de la party, no dónde está el pack)",
     cruxPrsOK, JSON.stringify(cruxPrs));

  // 6c ★ CRUX ⊥#126 DENSITY (ALLY-HP-STATE ⊥ MAGNITUD P,N): W invariante a P y a N. party grande maltrecha (W lo) vs party pequeña sana (W hi); density crece con conteo.
  const cruxDens = await page.evaluate(() => {
    const vit = (fracs, mobs) => window.__dev.partyVital({ vitalProbe: { fracs, mobs } }).vitalProbe;
    const dens = (counts, P) => window.__dev.aggroDensity({ densityProbe: { counts, players: P } }).densityProbe.weight;
    const bigBattered = { vit: vit([0.1, 0.1, 0.1, 0.1], 6), dens: dens([6], 4) };   // P4 party al 10% + N6: W lo, density hi
    const smallFresh = { vit: vit([1, 1], 3), dens: dens([3], 2) };                   // P2 party a full + N3: W hi, density lo
    return { bigBattered, smallFresh };
  });
  const cruxDensOK = cruxDens.bigBattered.vit.weight === 0 && cruxDens.smallFresh.vit.weight === 2      // TEMPLE OPUESTO (P4-battered 0 vs P2-fresh 2)
    && cruxDens.bigBattered.dens >= cruxDens.smallFresh.dens;                                           // density MISMA-dirección con conteo
  ok("6c ★ CRUX ⊥#126 DENSITY (ALLY-HP-STATE ⊥ MAGNITUD P,N): P4-battered/N6 ⇒ TEMPLE 0/density-hi vs P2-fresh/N3 ⇒ TEMPLE 2/density-lo (W invariante a P,N; density crece con conteo) ⇒ DISOCIAN",
     cruxDensOK, JSON.stringify(cruxDens));

  // 7 ★ P-INVARIANCE (W = mean HP-frac, ⊥ conteo P): MISMO frac con P distinto ⇒ MISMO W (el complemento del ⊥#126).
  const pInv = await page.evaluate(() => {
    const vit = (fracs, mobs) => { const m = window.__dev.partyVital({ vitalProbe: { fracs, mobs } }).vitalProbe; return { W: m.vital, w: m.weight, p: m.players }; };
    const two = vit([1, 1], 4);           // P2 full
    const four = vit([1, 1, 1, 1], 4);    // P4 full — MISMO W=1
    return { two, four };
  });
  const pInvOK = pInv.two.W === pInv.four.W && pInv.two.w === pInv.four.w && pInv.two.w === 2 && pInv.two.p === 2 && pInv.four.p === 4;
  ok("7 ★ P-INVARIANCE (W = mean HP-frac ⊥ P): P2 full-HP vs P4 full-HP ⇒ MISMO W=1/score2 (temple es la MEDIA de la party, invariante al conteo — complemento del ⊥#126)",
     pInvOK, JSON.stringify(pInv));

  // 8 ★ N-INVARIANCE (W ⊥ nº de mobs N, mientras N≥minMobs): MISMA party, N distinto (≥3) ⇒ MISMO W.
  const nInv = await page.evaluate(() => {
    const vit = (fracs, mobs) => { const m = window.__dev.partyVital({ vitalProbe: { fracs, mobs } }).vitalProbe; return { W: m.vital, w: m.weight, mobs: m.mobs }; };
    const three = vit([1, 1], 3);         // N3
    const eight = vit([1, 1], 8);         // N8 — MISMO W (la party no cambió)
    return { three, eight };
  });
  const nInvOK = nInv.three.W === nInv.eight.W && nInv.three.w === nInv.eight.w && nInv.three.w === 2 && nInv.three.mobs === 3 && nInv.eight.mobs === 8;
  ok("8 ★ N-INVARIANCE (W ⊥ nº de mobs, N≥minMobs): MISMA party P2 full-HP con N3 vs N8 ⇒ MISMO W=1/score2 (los mobs son sólo el gate; el HP de la party manda)",
     nInvOK, JSON.stringify(nInv));

  // 9 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: misma party fresca, SIN party (P=1) ⇒ W=0; CON party (P≥2) ⇒ W>0.
  const degen = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPts = (n, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase" }));
    const partyOf = (fracs) => fracs.map((frac, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1], frac }));
    window.__dev.partyVital({ enabled: true });
    const drive = (fracs) => { window.__dev.partyVital({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.partyVital({ driveVital: { players: partyOf(fracs), pts: mobPts(4), wipe: true } }).driveVital;
      const live = window.__dev.partyVital({ vitalProbeLive: true }).vitalProbeLive;
      return { idx: dv.idx, score: dv.score, players: live.players, engaged: live.engaged }; };
    const sp = drive([1]);        // single-player: P=1 ⇒ W=0 (colapso)
    const mp = drive([1, 1]);     // multijugador P2 ⇒ W>0/score2 (bien-definido)
    window.__dev.partyVital({ clearVital: true });
    window.__dev.partyVital({ enabled: false });
    return { sp, mp };
  }, { Z, PLAYER_OFF });
  const degenOK = degen.sp.players === 1 && degen.sp.idx === 0 && degen.sp.score === 0 && degen.mp.players === 2 && degen.mp.engaged === 4 && degen.mp.score === 2 && degen.mp.idx > 0.75;
  ok("9 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: misma party fresca SIN party (P=1) ⇒ W=0/score0; CON party (P=2) ⇒ W>0.75/score2 ⇒ colapsa LIMPIO y se ilumina sólo con party genuina",
     degenOK, JSON.stringify(degen));

  // 10 ★ INTEGER-DETERMINISM: dos vitalProbe idénticos ⇒ W/sum/w byte-idénticos (niveles de HP enteros + banda de sumas entera, 0-float division en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.partyVital({ vitalProbe: { fracs: [0.37, 0.91, 0.53, 0.72, 0.18], mobs: 4 } }).vitalProbe;
    const b = window.__dev.partyVital({ vitalProbe: { fracs: [0.37, 0.91, 0.53, 0.72, 0.18], mobs: 4 } }).vitalProbe;
    return { a: { W: a.vital, sum: a.sum, w: a.weight }, b: { W: b.vital, sum: b.sum, w: b.weight } };
  });
  const detOK = det.a.W === det.b.W && det.a.sum === det.b.sum && det.a.w === det.b.w;
  ok("10 ★ INTEGER-DETERMINISM: vitalProbe repetido ⇒ W/sum/weight byte-idénticos (Σ nivel-HP ENTERA hp·Q≥L·hpMax + banda de sumas entera ⇒ 0-float division en el score/decisión)",
     detOK, JSON.stringify(det));

  // 11 CANAL partyVitalFind: forageChargePreview con party sana >0 ; maltrecha → 0
  const forage = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPts = (n, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase" }));
    const partyOf = (fracs) => fracs.map((frac, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1], frac }));
    window.__dev.partyVital({ enabled: true });
    window.__dev.partyVital({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.partyVital({ driveVital: { players: partyOf([1, 1]), pts: mobPts(4), wipe: true } });   // sana ⇒ score2 ⇒ T2
    const actVm = window.__dev.partyVital();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.partyVital({ driveVital: { players: partyOf([0.1, 0.1]), pts: mobPts(4), wipe: true } });   // maltrecha ⇒ score0
    const goVm = window.__dev.partyVital();
    window.__dev.partyVital({ clearVital: true });
    window.__dev.partyVital({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, PLAYER_OFF });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("11 CANAL partyVitalFind: forageChargePreview party sana (W>0.75) ⇒ charge>0 (==partyVitalBonus); con party maltrecha (W<0.5) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 12 ★ SUB-CAP: charge never exceeds partyVitalBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let k = 2; k <= 10; k++) { const fracs = []; for (let i = 0; i < k; i++) fracs.push(1); vals.push(window.__dev.partyVital({ vitalProbe: { fracs, mobs: 4 } }).vitalProbe.charge); }  // k jugadores full-HP ⇒ W=1
    return { max: Math.max(...vals), cap: window.__dev.partyVital().cap };
  });
  ok("12 ★ SUB-CAP: ninguna party sana produce charge>partyVitalBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 13 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full healthy party available
  const neutral = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPts = (n, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase" }));
    const partyOf = (fracs) => fracs.map((frac, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1], frac }));
    window.__dev.partyVital({ enabled: true });
    window.__dev.partyVital({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.partyVital({ driveVital: { players: partyOf([1, 1]), pts: mobPts(4), wipe: true } });   // party sana disponible
    window.__dev.partyVital({ enabled: false });                          // now OFF
    const off = window.__dev.partyVital();
    window.__dev.partyVital({ enabled: true }); window.__dev.partyVital({ clearVital: true }); window.__dev.partyVital({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, players: off.players, engaged: off.engaged };
  }, { Z, PLAYER_OFF });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.players === 0 && neutral.engaged === 0;
  ok("13 ★ BYTE-NEUTRAL OFF: con OFF, partyVitalBonus(party sana disponible)==0 + forageChargePreview==0 + idx==0 + players==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 14 ★ ORTHOGONALITY: toggling aggroVigor/aggroPressure/aggroSurround/aggroDensity/aggroVariety/aggroPile no cambia la señal de partyVital.
  const orth = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPts = (n, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase" }));
    const partyOf = (fracs) => fracs.map((frac, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1], frac }));
    window.__dev.partyVital({ enabled: true });
    window.__dev.partyVital({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.partyVital({ driveVital: { players: partyOf([1, 1]), pts: mobPts(4), wipe: true } }).driveVital;
    const snap = () => JSON.stringify({ aggroVigor: window.__dev.aggroVigor(), aggroPressure: window.__dev.aggroPressure(), aggroSurround: window.__dev.aggroSurround(), aggroDensity: window.__dev.aggroDensity(), aggroVariety: window.__dev.aggroVariety(), aggroPile: window.__dev.aggroPile() });
    const peersOn = snap();
    const avPrev = window.__dev.aggroVigor().enabled, apPrev = window.__dev.aggroPressure().enabled, asPrev = window.__dev.aggroSurround().enabled, adPrev = window.__dev.aggroDensity().enabled, avaPrev = window.__dev.aggroVariety().enabled, aplPrev = window.__dev.aggroPile().enabled;
    window.__dev.aggroVigor({ enabled: !avPrev }); window.__dev.aggroPressure({ enabled: !apPrev }); window.__dev.aggroSurround({ enabled: !asPrev }); window.__dev.aggroDensity({ enabled: !adPrev }); window.__dev.aggroVariety({ enabled: !avaPrev }); window.__dev.aggroPile({ enabled: !aplPrev });
    const after = window.__dev.partyVital({ vitalProbeLive: true }).vitalProbeLive;
    window.__dev.aggroVigor({ enabled: avPrev }); window.__dev.aggroPressure({ enabled: apPrev }); window.__dev.aggroSurround({ enabled: asPrev }); window.__dev.aggroDensity({ enabled: adPrev }); window.__dev.aggroVariety({ enabled: avaPrev }); window.__dev.aggroPile({ enabled: aplPrev });
    const peersRestored = snap();
    window.__dev.partyVital({ clearVital: true });
    window.__dev.partyVital({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.engaged === after.engaged;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeEngaged: before.engaged, afterEngaged: after.engaged };
  }, { Z, PLAYER_OFF });
  ok("14 ★ ORTOGONALIDAD partyVitalFind ⊥ peers: la señal de temple (score/engaged) NO cambia al togglear AGGRO-VIGOR #131/AGGRO-PRESSURE #130/AGGRO-SURROUND #129/AGGRO-DENSITY #126/AGGRO-VARIETY #127/AGGRO-PILE #124; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION CENSUS: served config — 60 `_SURGE` totales, sole-false = PARTY_VITAL (59 true, incl. AGGRO_VIGOR #131 LIVE).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const aggroVigorLive = census.find(([n]) => n === "AGGRO_VIGOR_SURGE");
  const censusOK = total === 60 && trues === 59 && falses.length === 1 && falses[0] === "PARTY_VITAL_SURGE" && aggroVigorLive && aggroVigorLive[1] === "true";
  ok("15 ★ 0-REGRESIÓN CENSUS: served config 60 `_SURGE` totales, 59 enabled:true (incl. AGGRO_VIGOR_SURGE #131 LIVE), sole-false = PARTY_VITAL_SURGE (DARK #132)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} aggroVigor=${aggroVigorLive ? aggroVigorLive[1] : "?"}`);

  // 16 render badge "Temple:" drawn ON+sana / not OFF + fps. 🔑 label ÚNICO "Temple:" (⊥ #131 'Brío:').
  const badge = await page.evaluate(async (args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPts = (n, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase" }));
    const partyOf = (fracs) => fracs.map((frac, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1], frac }));
    const drive = () => window.__dev.partyVital({ driveVital: { players: partyOf([1, 1]), pts: mobPts(4), wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Temple:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.partyVital({ enabled: true });
    window.__dev.partyVital({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.partyVital({ clearVital: true });
    window.__dev.partyVital({ enabled: false });
    const enAtOff = window.__dev.partyVital().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, PLAYER_OFF });
  ok("16 render badge \"Temple:\" se DIBUJA ON+sana (W>0, re-driven cada frame) y NO OFF (W 0) + fps sano (label ÚNICO ⊥ #131 'Brío:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, PLAYER_OFF } = args; const mobPts = (n, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase" })); const partyOf = (fracs) => fracs.map((frac, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1], frac })); window.__dev.partyVital({ enabled: true }); window.__dev.partyVital({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.partyVital({ driveVital: { players: partyOf([1, 1]), pts: mobPts(4), wipe: true } }); }, { Z, PLAYER_OFF });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.partyVital({ clearVital: true }); window.__dev.partyVital({ enabled: false }); });

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
    const mobPts = (n, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase" }));
    const partyOf = (fracs) => fracs.map((frac, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1], frac }));
    window.__dev.partyVital({ enabled: true });
    window.__dev.partyVital({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.partyVital({ driveVital: { players: partyOf([1, 1]), pts: mobPts(4), wipe: true } }).driveVital;   // P2, 4 mobs ⇒ W hi ⇒ score2
    const vm = window.__dev.partyVital();
    const lut = [[[1, 1], 4], [[0.1, 0.1], 4], [[0.6, 0.6], 4], [[0.95, 0.95, 0.95], 3]].map(([fracs, mobs]) => { const m = window.__dev.partyVital({ vitalProbe: { fracs, mobs } }).vitalProbe; return { p: m.players, W: m.vital, sum: m.sum, tier: m.tier, charge: m.charge }; });
    const live = window.__dev.partyVital({ vitalProbeLive: true }).vitalProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.partyVital({ clearVital: true });
    window.__dev.partyVital({ enabled: false });
    return { score: dv.score, idx: dv.idx, engaged: dv.engaged, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveEngaged: live.engaged, livePlayers: live.players, lut, fp };
  }, { Z, FPARG, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.engaged === B.engaged && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveEngaged === B.liveEngaged && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("17 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMA party P2 full-HP + 4 mobs (W=hi sana) ⇒ score/idx/engaged/players/tier/charge + vitalProbeLive(field,engaged,players,score) + vitalProbe LUT (W/sum enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},engaged:${A.engaged},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveEngaged:${A.liveEngaged},livePlayers:${A.livePlayers},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},engaged:${B.engaged},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveEngaged:${B.liveEngaged},livePlayers:${B.livePlayers},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.partyVital({ enabled: false }));
  await pageB.evaluate(() => window.__dev.partyVital({ enabled: false }));

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
