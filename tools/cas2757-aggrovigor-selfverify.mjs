// CAS-2757 — self-verify for BRÍO (DARK, AGGRO_VIGOR_SURGE.enabled:false). EVO mecánica #131 (base master 8c82c7b tras #130 AGGRO_PRESSURE LIVE&served 297d259bb5f9/815) — EJE FRESCO + CANAL FRESCO, ⊥ a las 72 LIVE #59-#130. El 13º eje de COMPOSICIÓN-DE-INTENCIÓN y el 1º de la sub-familia MOB-HP-STATE: cuánta pelea LE QUEDA al pack ENGANCHADO (la SALUD RESTANTE — un DATO que ningún prior lee). Los dos últimos ejes cerraron la GEOMETRÍA PURA: #129 SURROUND (ANGULAR) + #130 PRESSURE (RADIAL) = los DOS componentes ortogonales de la POSICIÓN.
// (A) EJE FRESCO = BRÍO/HP-state = aggroVigorField(hero) = V = mean(hp/hpMax) sobre los mobs ALIVE ENGANCHADOS en radio. SNAPSHOT PURO (lee hero+mob hp directo, SIN buffer temporal, como #129/#130). 🔑 DETERMINISMO (sev-1): hp/hpMax ENTEROS ⇒ nivel-de-HP CUANTIZADO a niveles ENTEROS (vigBins 64) vía comparación ENTERA hp·Q ≥ L·hpMax; banda por comparación de sumas ENTERAS (0-float division en el score/decisión). Bandas sobre V: ≥hiVigor(0.75) ⇒ fresco ⇒ 2; ≥midVigor(0.5) ⇒ medio-fresco ⇒ 1; <mid (maltrecho) ⇒ 0. Requiere ≥minMobs(3) y ≥minPlayers(2). 🔑 INTRÍNSECAMENTE MULTIJUGADOR: single-player ⇒ P<2 ⇒ V=0 (colapso LIMPIO).
// (B) CANAL FRESCO = aggroVigorFind (fichas de brío por enganchar/rematar un pack FRESCO — NINGUNA de las 72 flags lo usa). Moneda FRESCA (h.aggroVigorBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — HP-STATE ⊥ TODOS los priores: ⊥#130 PRESSURE (RADIAL) & ⊥#129 SURROUND (ANGULAR): ciego a la posición (point-blank-fresh V-hi vs point-blank-battered V-lo, MISMA geometría) ⊥#126 DENSITY (magnitud N: N6-battered V-lo vs N3-fresh V-hi, V invariante a N) ⊥#127 VARIETY (tipo: mixed-battered variety-hi/V-lo vs mono-fresh variety-lo/V-hi).
//
// Run: node tools/cas2757-aggrovigor-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2757");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// vigorProbe LUT esperada: (fracs ∈[0,1], players)→N=len→Σ nivel-HP ENTERO (hp=round(frac·1000))→V=sum/(N·Q)→banda(sumas ENTERAS)→{weight,tier}. UMBRALES hiVigor 0.75 / midVigor 0.5 + colapso single-player (P<2 ⇒ 0) + minMobs (N<3 ⇒ 0). Q=64, HM=1000. Casos ELEGIDOS lejos de los umbrales.
const EXPECT_VIGOR = [
  { name: "fresh-4",        fracs: [1, 1, 1, 1],           players: 2, w: 2 },   // 4 a full-HP ⇒ V=1 ⇒ fresco ⇒ 2
  { name: "battered-4",     fracs: [0.1, 0.1, 0.1, 0.1],   players: 2, w: 0 },   // 4 casi-muertos (10% HP) ⇒ V≈0.09 ⇒ maltrecho ⇒ 0 (MISMO N que fresh-4, HP OPUESTO)
  { name: "some-4",         fracs: [0.6, 0.6, 0.6, 0.6],   players: 2, w: 1 },   // 4 al 60% ⇒ V≈0.59 ⇒ medio-fresco ⇒ 1
  { name: "triad-fresh",    fracs: [0.95, 0.95, 0.95],     players: 2, w: 2 },   // 3 al 95% ⇒ V≈0.94 ⇒ 2
  { name: "penta-battered", fracs: [0.15, 0.15, 0.15, 0.15, 0.15], players: 2, w: 0 }, // 5 al 15% ⇒ V≈0.14 ⇒ 0
  { name: "pair-<minMobs",  fracs: [1, 1],                 players: 2, w: 0 },   // 🔑 N2 <minMobs3 ⇒ degenerado ⇒ 0
  { name: "fresh-single-player", fracs: [1, 1, 1, 1],      players: 1, w: 0 },   // 🔑 single-player (P1) ⇒ degenerado ⇒ 0 (colapso LIMPIO)
];
// driveVigor REAL: inyecta party sintética (P=hero+extra) + mobs con HP dado (e.maxHp=1000, e.hp=round(frac·1000)); V server-auth. Requiere ≥minMobs(3) y ≥minPlayers(2).
const EXPECT_DRIVE = [
  { name: "fresh-P2",    players: 1, fracs: [1, 1, 1, 1],         w: 2 },
  { name: "battered-P2", players: 1, fracs: [0.1, 0.1, 0.1, 0.1], w: 0 },
  { name: "some-P2",     players: 1, fracs: [0.6, 0.6, 0.6, 0.6], w: 1 },
  { name: "single-player", players: 0, fracs: [1, 1, 1, 1],       w: 0 },   // 🔑 P1 (sólo héroe) ⇒ 0
  { name: "2mob-<minMobs", players: 1, fracs: [1, 1],             w: 0 },   // N2 <minMobs3 ⇒ 0
];
const PLAYER_OFF = [[44, 0], [0, 44], [-44, 0], [30, 30], [-30, 30]];   // offsets de jugadores sintéticos (dentro de radio 300)
// fracPts: mobs con HP dado, repartidos angularmente parejo a dist fija (posición NO afecta V — vigor lee sólo HP). deg/dist sólo posicionan.
const fracPts = (fracs, dist = 120) => fracs.map((frac, i) => ({ deg: Math.round(360 * i / Math.max(1, fracs.length)), dist, type: "rat", state: "chase", frac }));

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.aggroVigor && window.__dev.aggroPressure && window.__dev.aggroSurround && window.__dev.aggroDensity && window.__dev.aggroVariety && window.__dev.converge && window.__dev.aggroPile && window.__dev.aggroContest && window.__dev.targetSpread && window.__dev.aggroFocus && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.aggroVigor + peer hooks (aggroPressure/aggroSurround/aggroDensity/aggroVariety/converge/aggroPile/aggroContest/targetSpread/aggroFocus) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.aggroVigor());
  ok("2 byte-id OFF (fresh boot): AGGRO_VIGOR_SURGE.enabled false AND G.aggroVigorBounty NUNCA se crea (gExists false) AND G._vigParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.engaged === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "aggroVigorFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} engaged=${dark.engaged} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiVigor=${dark.hiVigor} midVigor=${dark.midVigor} vigBins=${dark.vigBins} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no aggroVigorFind/aggroVigorBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(aggroVigorFind|aggroVigorBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"aggroVigorBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'aggroVigorFind'/'aggroVigorBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroVigor({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroVigor({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ vigorProbe LUT: (fracs,players)→N→Σ HP ENTERA→V=sum/(N·Q)→banda(sumas ENTERAS)→tier→charge (UMBRALES hiVigor/midVigor + colapso single-player + minMobs).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.aggroVigor({ vigorProbe: { fracs: c.fracs, players: c.players } }).vigorProbe), EXPECT_VIGOR);
  const tabOK = EXPECT_VIGOR.every((c, i) => tab[i] && tab[i].weight === c.w);
  ok("5 ★ vigorProbe LUT (FRACCIÓN-DE-HP V=mean(hp/hpMax)): fresh(f1)⇒V=1/w2, battered(f0.1)⇒V≈0.09/w0 (MISMO N, HP opuesto), some(f0.6)⇒w1, triad-fresh⇒w2, penta-battered⇒w0, pair⇒N2<minMobs⇒0, fresh-single-player⇒0. UMBRAL hiVigor 0.75/midVigor 0.5",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_VIGOR[i].name, n: x.total, V: x.vigor, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH BRÍO: driveVigor inyecta party sintética + mobs con HP dado ⇒ V REAL server-auth.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, PLAYER_OFF } = args;
    const fracPts = (fracs, dist = 120) => fracs.map((frac, i) => ({ deg: Math.round(360 * i / Math.max(1, fracs.length)), dist, type: "rat", state: "chase", frac }));
    window.__dev.aggroVigor({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.aggroVigor({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, c.players).map(([dx, dy]) => ({ dx, dy }));
      const dv = window.__dev.aggroVigor({ driveVigor: { players, pts: fracPts(c.fracs), wipe: true } }).driveVigor;
      const live = window.__dev.aggroVigor({ vigorProbeLive: true }).vigorProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvEngaged: dv.engaged, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, engaged: live.engaged, livePlayers: live.players });
    }
    window.__dev.aggroVigor({ clearVigor: true });
    window.__dev.aggroVigor({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w);
  ok("5b ★ REAL SERVER-AUTH BRÍO (hero+mob hp snapshot): fresh(P2)=w2, battered(P2)=w0, some(P2)=w1, single-player(P1)=0, 2mob(<minMobs)=0",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA) ⊥#130 PRESSURE (HP-STATE ⊥ RADIAL-POSICIÓN): MISMA geometría point-blank (P=hi para ambos), pack FRESCO (V=hi) vs pack MALTRECHO (V=lo) ⇒ DISOCIAN. La posición no dice nada del HP.
  const cruxPrs = await page.evaluate(() => {
    const vigW = (fracs, P) => window.__dev.aggroVigor({ vigorProbe: { fracs, players: P } }).vigorProbe.weight;
    const prsW = (dists, P) => window.__dev.aggroPressure({ pressureProbe: { dists, players: P } }).pressureProbe.weight;
    // point-blank-fresh: 4 a quemarropa (d30 ⇒ P≈0.89 apretado RADIAL) todos full-HP (V=1 fresco)
    const pbFresh = { prs: prsW([30, 30, 30, 30], 2), vig: vigW([1, 1, 1, 1], 2) };
    // point-blank-battered: 4 a quemarropa (MISMA geometría, P≈0.89) todos casi-muertos (V≈0.09 maltrecho)
    const pbBattered = { prs: prsW([30, 30, 30, 30], 2), vig: vigW([0.1, 0.1, 0.1, 0.1], 2) };
    return { pbFresh, pbBattered };
  });
  const cruxPrsOK = cruxPrs.pbFresh.prs === 2 && cruxPrs.pbFresh.vig === 2        // apretado radial + fresco
    && cruxPrs.pbBattered.prs === 2 && cruxPrs.pbBattered.vig === 0;             // MISMO apretado radial + maltrecho
  ok("6 ★ CRUX (LA CRÍTICA) ⊥#130 PRESSURE (HP-STATE ⊥ RADIAL): point-blank-fresh ⇒ PRESSURE 2/VIGOR 2 vs point-blank-battered ⇒ PRESSURE 2/VIGOR 0 (MISMA geometría a quemarropa, brío OPUESTO) ⇒ DISOCIAN (VIGOR es ciego a la posición)",
     cruxPrsOK, JSON.stringify(cruxPrs));

  // 6b ★ CRUX ⊥#126 DENSITY (HP-STATE ⊥ MAGNITUD-N): N=6 casi-muertos (density hi, V lo) vs N=3 frescos (density menor, V hi). V invariante a N (mean HP-frac); density crece con N/P.
  const cruxDens = await page.evaluate(() => {
    const vig = (fracs, P) => window.__dev.aggroVigor({ vigorProbe: { fracs, players: P } }).vigorProbe.weight;
    const dens = (counts, P) => window.__dev.aggroDensity({ densityProbe: { counts, players: P } }).densityProbe.weight;
    const sixBattered = { vig: vig([0.1, 0.1, 0.1, 0.1, 0.1, 0.1], 2), dens: dens([6], 2) };   // N6 battered: V lo, density hi
    const triFresh = { vig: vig([1, 1, 1], 2), dens: dens([3], 2) };                            // N3 fresh: V hi, density lo
    return { sixBattered, triFresh };
  });
  const cruxDensOK = cruxDens.sixBattered.vig === 0 && cruxDens.triFresh.vig === 2      // vigor OPUESTO (N6-battered 0 vs N3-fresh 2)
    && cruxDens.sixBattered.dens >= cruxDens.triFresh.dens;                             // density MISMA-dirección con N (N6 ≥ N3)
  ok("6b ★ CRUX ⊥#126 DENSITY (HP-STATE ⊥ MAGNITUD-N): N6-battered ⇒ VIGOR 0/density-hi vs N3-fresh ⇒ VIGOR 2/density-lo (V invariante a N; density crece con N/P) ⇒ DISOCIAN",
     cruxDensOK, JSON.stringify(cruxDens));

  // 6c ★ CRUX ⊥#127 VARIETY (HP-STATE ⊥ MOB-TYPE): mixed-type-battered (variety hi, V lo) vs mono-type-fresh (variety lo, V hi). VIGOR ciego al tipo; VARIETY ciego al HP.
  const cruxVar = await page.evaluate(() => {
    const vig = (fracs, P) => window.__dev.aggroVigor({ vigorProbe: { fracs, players: P } }).vigorProbe.weight;
    const varW = (types, P) => window.__dev.aggroVariety({ varietyProbe: { types, players: P } }).varietyProbe.weight;
    const mixedBattered = { varW: varW(["rat", "skel", "orc"], 2), vig: vig([0.1, 0.1, 0.1], 2) };  // 3 tipos distintos (variety hi) al 10% HP (V lo)
    const monoFresh = { varW: varW(["rat", "rat", "rat"], 2), vig: vig([1, 1, 1], 2) };             // 3 idénticos (variety lo) a full (V hi)
    return { mixedBattered, monoFresh };
  });
  const cruxVarOK = cruxVar.mixedBattered.varW > cruxVar.monoFresh.varW      // variety OPUESTA (mixed hi > mono lo)
    && cruxVar.mixedBattered.vig < cruxVar.monoFresh.vig                     // vigor OPUESTA (mixed-battered lo < mono-fresh hi)
    && cruxVar.mixedBattered.vig === 0 && cruxVar.monoFresh.vig === 2;
  ok("6c ★ CRUX ⊥#127 VARIETY (HP-STATE ⊥ MOB-TYPE): mixed-type-battered ⇒ VARIETY hi/VIGOR 0 vs mono-type-fresh ⇒ VARIETY lo/VIGOR 2 (VIGOR ciego al tipo, lee sólo HP; VARIETY ciego al HP) ⇒ DISOCIAN",
     cruxVarOK, JSON.stringify(cruxVar));

  // 7 ★ POSITION-INVARIANCE (V = HP-state, ⊥ posición/dist/ángulo): MISMOS fracs a distancias/bearings MUY distintos ⇒ MISMO V (el complemento del ⊥#130/#129).
  const posInv = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    window.__dev.aggroVigor({ enabled: true });
    const drive = (dist) => { window.__dev.aggroVigor({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2
      const pts = [0, 90, 180, 270].map((deg) => ({ deg, dist, type: "rat", state: "chase", frac: 1 }));   // full-HP a dist dada
      const dv = window.__dev.aggroVigor({ driveVigor: { players, pts, wipe: true } }).driveVigor;
      return { idx: dv.idx, score: dv.score, engaged: dv.engaged }; };
    const near = drive(30);      // pegados
    const far = drive(250);      // lejos — MISMO HP (full)
    window.__dev.aggroVigor({ clearVigor: true });
    window.__dev.aggroVigor({ enabled: false });
    return { near, far };
  }, { Z, PLAYER_OFF });
  const posInvOK = posInv.near.score === posInv.far.score && posInv.near.idx === posInv.far.idx && posInv.near.score === 2 && posInv.near.engaged === 4;
  ok("7 ★ POSITION-INVARIANCE (V HP-STATE ⊥ posición): MISMOS 4 full-HP pegados (d30) vs lejos (d250) ⇒ MISMO V/score2 (vigor lee sólo el HP, no dónde están — complemento del ⊥#130/#129)",
     posInvOK, JSON.stringify(posInv));

  // 8 ★ N-INVARIANCE (V = mean HP-frac, ⊥ conteo N): MISMO frac con N distinto ⇒ MISMO V (el complemento del ⊥#126).
  const nInv = await page.evaluate(() => {
    const vig = (fracs, P) => { const m = window.__dev.aggroVigor({ vigorProbe: { fracs, players: P } }).vigorProbe; return { V: m.vigor, w: m.weight, n: m.total }; };
    const three = vig([1, 1, 1], 2);        // N3 full
    const six = vig([1, 1, 1, 1, 1, 1], 2); // N6 full — MISMO V=1
    return { three, six };
  });
  const nInvOK = nInv.three.V === nInv.six.V && nInv.three.w === nInv.six.w && nInv.three.w === 2 && nInv.three.n === 3 && nInv.six.n === 6;
  ok("8 ★ N-INVARIANCE (V = mean HP-frac ⊥ N): N3 full-HP vs N6 full-HP ⇒ MISMO V=1/score2 (vigor es la MEDIA, invariante al conteo — complemento del ⊥#126)",
     nInvOK, JSON.stringify(nInv));

  // 9 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: mismo pack fresco, SIN party (P=1) ⇒ V=0; CON party (P≥2) ⇒ V>0.
  const degen = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const fracPts = (fracs, dist = 120) => fracs.map((frac, i) => ({ deg: Math.round(360 * i / Math.max(1, fracs.length)), dist, type: "rat", state: "chase", frac }));
    window.__dev.aggroVigor({ enabled: true });
    const drive = (nPlayers, fracs) => { window.__dev.aggroVigor({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, nPlayers).map(([dx, dy]) => ({ dx, dy }));
      const dv = window.__dev.aggroVigor({ driveVigor: { players, pts: fracPts(fracs), wipe: true } }).driveVigor;
      const live = window.__dev.aggroVigor({ vigorProbeLive: true }).vigorProbeLive;
      return { idx: dv.idx, score: dv.score, players: live.players, engaged: live.engaged }; };
    const fresh = [1, 1, 1, 1];
    const sp = drive(0, fresh);   // single-player: P=1 ⇒ V=0 (colapso)
    const mp = drive(1, fresh);   // multijugador P2 ⇒ V>0/score2 (bien-definido)
    window.__dev.aggroVigor({ clearVigor: true });
    window.__dev.aggroVigor({ enabled: false });
    return { sp, mp };
  }, { Z, PLAYER_OFF });
  const degenOK = degen.sp.players === 1 && degen.sp.idx === 0 && degen.sp.score === 0 && degen.mp.players === 2 && degen.mp.engaged === 4 && degen.mp.score === 2 && degen.mp.idx > 0.75;
  ok("9 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: mismo pack fresco (4 full-HP) SIN party (P=1) ⇒ V=0/score0; CON party (P=2) ⇒ V>0.75/score2 ⇒ colapsa LIMPIO y se ilumina sólo con party genuina",
     degenOK, JSON.stringify(degen));

  // 10 ★ INTEGER-DETERMINISM: dos vigorProbe idénticos ⇒ V/sum/w byte-idénticos (niveles de HP enteros + banda de sumas entera, 0-float division en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.aggroVigor({ vigorProbe: { fracs: [0.37, 0.91, 0.53, 0.72, 0.18], players: 2 } }).vigorProbe;
    const b = window.__dev.aggroVigor({ vigorProbe: { fracs: [0.37, 0.91, 0.53, 0.72, 0.18], players: 2 } }).vigorProbe;
    return { a: { V: a.vigor, sum: a.sum, w: a.weight }, b: { V: b.vigor, sum: b.sum, w: b.weight } };
  });
  const detOK = det.a.V === det.b.V && det.a.sum === det.b.sum && det.a.w === det.b.w;
  ok("10 ★ INTEGER-DETERMINISM: vigorProbe repetido ⇒ V/sum/weight byte-idénticos (Σ nivel-HP ENTERA hp·Q≥L·hpMax + banda de sumas entera ⇒ 0-float division en el score/decisión)",
     detOK, JSON.stringify(det));

  // 11 CANAL aggroVigorFind: forageChargePreview con pack fresco >0 ; maltrecho → 0
  const forage = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const fracPts = (fracs, dist = 120) => fracs.map((frac, i) => ({ deg: Math.round(360 * i / Math.max(1, fracs.length)), dist, type: "rat", state: "chase", frac }));
    window.__dev.aggroVigor({ enabled: true });
    window.__dev.aggroVigor({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2
    window.__dev.aggroVigor({ driveVigor: { players, pts: fracPts([1, 1, 1, 1]), wipe: true } });   // fresco ⇒ score2 ⇒ T2
    const actVm = window.__dev.aggroVigor();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.aggroVigor({ driveVigor: { players, pts: fracPts([0.1, 0.1, 0.1, 0.1]), wipe: true } });   // maltrecho ⇒ score0
    const goVm = window.__dev.aggroVigor();
    window.__dev.aggroVigor({ clearVigor: true });
    window.__dev.aggroVigor({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, PLAYER_OFF });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("11 CANAL aggroVigorFind: forageChargePreview fresco (V>0.75) ⇒ charge>0 (==aggroVigorBonus); con maltrecho (V<0.5) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 12 ★ SUB-CAP: charge never exceeds aggroVigorBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let k = 3; k <= 12; k++) { const fracs = []; for (let i = 0; i < k; i++) fracs.push(1); vals.push(window.__dev.aggroVigor({ vigorProbe: { fracs, players: 2 } }).vigorProbe.charge); }  // k mobs full-HP ⇒ V=1
    return { max: Math.max(...vals), cap: window.__dev.aggroVigor().cap };
  });
  ok("12 ★ SUB-CAP: ningún pack fresco produce charge>aggroVigorBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 13 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full fresh pack available
  const neutral = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const fracPts = (fracs, dist = 120) => fracs.map((frac, i) => ({ deg: Math.round(360 * i / Math.max(1, fracs.length)), dist, type: "rat", state: "chase", frac }));
    window.__dev.aggroVigor({ enabled: true });
    window.__dev.aggroVigor({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.aggroVigor({ driveVigor: { players, pts: fracPts([1, 1, 1, 1]), wipe: true } });   // pack fresco disponible
    window.__dev.aggroVigor({ enabled: false });                          // now OFF
    const off = window.__dev.aggroVigor();
    window.__dev.aggroVigor({ enabled: true }); window.__dev.aggroVigor({ clearVigor: true }); window.__dev.aggroVigor({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, engaged: off.engaged };
  }, { Z, PLAYER_OFF });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.engaged === 0;
  ok("13 ★ BYTE-NEUTRAL OFF: con OFF, aggroVigorBonus(pack fresco disponible)==0 + forageChargePreview==0 + idx==0 + engaged==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 14 ★ ORTHOGONALITY: toggling aggroPressure/aggroSurround/aggroDensity/aggroVariety/aggroPile/aggroFocus no cambia la señal de aggroVigor.
  const orth = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const fracPts = (fracs, dist = 120) => fracs.map((frac, i) => ({ deg: Math.round(360 * i / Math.max(1, fracs.length)), dist, type: "rat", state: "chase", frac }));
    window.__dev.aggroVigor({ enabled: true });
    window.__dev.aggroVigor({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    const before = window.__dev.aggroVigor({ driveVigor: { players, pts: fracPts([1, 1, 1, 1]), wipe: true } }).driveVigor;
    const snap = () => JSON.stringify({ aggroPressure: window.__dev.aggroPressure(), aggroSurround: window.__dev.aggroSurround(), aggroDensity: window.__dev.aggroDensity(), aggroVariety: window.__dev.aggroVariety(), aggroPile: window.__dev.aggroPile(), aggroFocus: window.__dev.aggroFocus() });
    const peersOn = snap();
    const apPrev = window.__dev.aggroPressure().enabled, asPrev = window.__dev.aggroSurround().enabled, adPrev = window.__dev.aggroDensity().enabled, avPrev = window.__dev.aggroVariety().enabled, aplPrev = window.__dev.aggroPile().enabled, afPrev = window.__dev.aggroFocus().enabled;
    window.__dev.aggroPressure({ enabled: !apPrev }); window.__dev.aggroSurround({ enabled: !asPrev }); window.__dev.aggroDensity({ enabled: !adPrev }); window.__dev.aggroVariety({ enabled: !avPrev }); window.__dev.aggroPile({ enabled: !aplPrev }); window.__dev.aggroFocus({ enabled: !afPrev });
    const after = window.__dev.aggroVigor({ vigorProbeLive: true }).vigorProbeLive;
    window.__dev.aggroPressure({ enabled: apPrev }); window.__dev.aggroSurround({ enabled: asPrev }); window.__dev.aggroDensity({ enabled: adPrev }); window.__dev.aggroVariety({ enabled: avPrev }); window.__dev.aggroPile({ enabled: aplPrev }); window.__dev.aggroFocus({ enabled: afPrev });
    const peersRestored = snap();
    window.__dev.aggroVigor({ clearVigor: true });
    window.__dev.aggroVigor({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.engaged === after.engaged;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeEngaged: before.engaged, afterEngaged: after.engaged };
  }, { Z, PLAYER_OFF });
  ok("14 ★ ORTOGONALIDAD aggroVigorFind ⊥ peers: la señal de brío (score/engaged) NO cambia al togglear AGGRO-PRESSURE #130/AGGRO-SURROUND #129/AGGRO-DENSITY #126/AGGRO-VARIETY #127/AGGRO-PILE #124/AGGRO-FOCUS #118; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION CENSUS: served config — 59 `_SURGE` totales, sole-false = AGGRO_VIGOR (58 true, incl. AGGRO_PRESSURE #130 + AGGRO_SURROUND #129 LIVE).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const aggroPressureLive = census.find(([n]) => n === "AGGRO_PRESSURE_SURGE");
  const aggroSurroundLive = census.find(([n]) => n === "AGGRO_SURROUND_SURGE");
  const censusOK = total === 59 && trues === 58 && falses.length === 1 && falses[0] === "AGGRO_VIGOR_SURGE" && aggroPressureLive && aggroPressureLive[1] === "true" && aggroSurroundLive && aggroSurroundLive[1] === "true";
  ok("15 ★ 0-REGRESIÓN CENSUS: served config 59 `_SURGE` totales, 58 enabled:true (incl. AGGRO_PRESSURE_SURGE #130 + AGGRO_SURROUND_SURGE #129 LIVE), sole-false = AGGRO_VIGOR_SURGE (DARK #131)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} aggroPressure=${aggroPressureLive ? aggroPressureLive[1] : "?"} aggroSurround=${aggroSurroundLive ? aggroSurroundLive[1] : "?"}`);

  // 16 render badge "Brío:" drawn ON+fresco / not OFF + fps. 🔑 label ÚNICO "Brío:" (⊥ #130 'Apremio:').
  const badge = await page.evaluate(async (args) => {
    const { Z, PLAYER_OFF } = args;
    const fracPts = (fracs, dist = 120) => fracs.map((frac, i) => ({ deg: Math.round(360 * i / Math.max(1, fracs.length)), dist, type: "rat", state: "chase", frac }));
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    const drive = () => window.__dev.aggroVigor({ driveVigor: { players, pts: fracPts([1, 1, 1, 1]), wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Brío:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.aggroVigor({ enabled: true });
    window.__dev.aggroVigor({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.aggroVigor({ clearVigor: true });
    window.__dev.aggroVigor({ enabled: false });
    const enAtOff = window.__dev.aggroVigor().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, PLAYER_OFF });
  ok("16 render badge \"Brío:\" se DIBUJA ON+fresco (V>0, re-driven cada frame) y NO OFF (V 0) + fps sano (label ÚNICO ⊥ #130 'Apremio:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, PLAYER_OFF } = args; const fracPts = (fracs, dist = 120) => fracs.map((frac, i) => ({ deg: Math.round(360 * i / Math.max(1, fracs.length)), dist, type: "rat", state: "chase", frac })); const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy })); window.__dev.aggroVigor({ enabled: true }); window.__dev.aggroVigor({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.aggroVigor({ driveVigor: { players, pts: fracPts([1, 1, 1, 1]), wipe: true } }); }, { Z, PLAYER_OFF });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.aggroVigor({ clearVigor: true }); window.__dev.aggroVigor({ enabled: false }); });

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
    const fracPts = (fracs, dist = 120) => fracs.map((frac, i) => ({ deg: Math.round(360 * i / Math.max(1, fracs.length)), dist, type: "rat", state: "chase", frac }));
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2, 4 full-HP ⇒ V hi ⇒ score2
    window.__dev.aggroVigor({ enabled: true });
    window.__dev.aggroVigor({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.aggroVigor({ driveVigor: { players, pts: fracPts([1, 1, 1, 1]), wipe: true } }).driveVigor;
    const vm = window.__dev.aggroVigor();
    const lut = [[[1, 1, 1, 1], 2], [[0.1, 0.1, 0.1, 0.1], 2], [[0.6, 0.6, 0.6, 0.6], 2], [[0.95, 0.95, 0.95], 2]].map(([fracs, P]) => { const m = window.__dev.aggroVigor({ vigorProbe: { fracs, players: P } }).vigorProbe; return { n: m.total, V: m.vigor, sum: m.sum, tier: m.tier, charge: m.charge }; });
    const live = window.__dev.aggroVigor({ vigorProbeLive: true }).vigorProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.aggroVigor({ clearVigor: true });
    window.__dev.aggroVigor({ enabled: false });
    return { score: dv.score, idx: dv.idx, engaged: dv.engaged, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveEngaged: live.engaged, players: live.players, lut, fp };
  }, { Z, FPARG, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.engaged === B.engaged && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveEngaged === B.liveEngaged && A.players === B.players && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("17 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMA party+mobs full-HP (P2, N4, V=hi fresco)+héroe ⇒ score/idx/engaged/tier/charge + vigorProbeLive(field,engaged,players,score) + vigorProbe LUT (V/sum enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},engaged:${A.engaged},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveEngaged:${A.liveEngaged},players:${A.players},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},engaged:${B.engaged},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveEngaged:${B.liveEngaged},players:${B.players},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.aggroVigor({ enabled: false }));
  await pageB.evaluate(() => window.__dev.aggroVigor({ enabled: false }));

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
