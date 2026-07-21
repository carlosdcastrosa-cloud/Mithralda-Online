// CAS-2753 — self-verify for ACOSO (DARK, AGGRO_PRESSURE_SURGE.enabled:false). EVO mecánica #130 (base master fa17d8c tras #129 AGGRO_SURROUND LIVE&served 61dd36e1005a/815) — EJE FRESCO + CANAL FRESCO, ⊥ a las 71 LIVE #59-#129. El 12º eje de COMPOSICIÓN-DE-INTENCIÓN y el 2º GEOMÉTRICO-PURO: el componente RADIAL (cuán CERCA se aprieta el pack ENGANCHADO), ortogonal al ANGULAR (#129 SURROUND). La geometría de un pack alrededor de un punto = DOS componentes ortogonales: ANGULAR (#129) y RADIAL (#130, este eje).
// (A) EJE FRESCO = ACOSO/cercanía = aggroPressureField(hero) = P = mean((R−d)/R) sobre los mobs ALIVE ENGANCHADOS en radio. SNAPSHOT PURO (lee hero+mob pos directo, SIN buffer temporal, como #129). 🔑 DETERMINISMO (sev-1): cercanía por mob CUANTIZADA a niveles ENTEROS (closeBins 64) vía comparación ENTERA Q²·d² ≤ R²(Q−L)²; banda por comparación de sumas ENTERAS (0-float sqrt en el score/decisión). Bandas sobre P: ≥hiPress(0.75) ⇒ apretado ⇒ 2; ≥midPress(0.5) ⇒ acoso-parcial ⇒ 1; <mid (con-sitio) ⇒ 0. Requiere ≥minMobs(3) y ≥minPlayers(2). 🔑 INTRÍNSECAMENTE MULTIJUGADOR: single-player ⇒ P<2 ⇒ P=0 (colapso LIMPIO).
// (B) CANAL FRESCO = aggroPressureFind (fichas de acoso por rematar APRETADO — NINGUNA de las 71 flags lo usa). Moneda FRESCA (h.aggroPressureBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — RADIAL POSICIÓN (cuán cerca) ⊥ TODOS los priores: ⊥#129 SURROUND (ANGULAR: anillo-al-borde S-hi/P-lo vs un-lado-quemarropa S-0/P-hi, los DOS componentes ortogonales) ⊥#126 DENSITY (magnitud N: N6-al-borde P-lo/density-hi vs N3-quemarropa P-hi/density-lo, P invariante a N) ⊥#112 CONVERGE (VELOCIDAD radial: P es POSICIÓN estática — motion-invariant).
//
// Run: node tools/cas2753-aggropressure-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2753");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// pressureProbe LUT esperada: (dists px, players)→N=len→Σ nivel-cercanía ENTERO→P=sum/(N·Q)→banda(sumas ENTERAS)→{weight,tier}. UMBRALES hiPress 0.75 / midPress 0.5 + colapso single-player (P<2 ⇒ 0) + minMobs (N<3 ⇒ 0). R=300, Q=64. Casos ELEGIDOS lejos de los umbrales.
const EXPECT_PRESSURE = [
  { name: "point-blank-4", dists: [45, 45, 45, 45],       players: 2, w: 2 },   // 4 a quemarropa (d45) ⇒ closeness≈0.85 ⇒ P≈0.84 ⇒ apretado ⇒ 2
  { name: "edge-4",        dists: [255, 255, 255, 255],   players: 2, w: 0 },   // 4 en el borde (d255) ⇒ closeness≈0.15 ⇒ P≈0.14 ⇒ con-sitio ⇒ 0 (MISMO N que point-blank, radial OPUESTO)
  { name: "some-4",        dists: [135, 135, 135, 135],   players: 2, w: 1 },   // 4 a media distancia (d135) ⇒ closeness≈0.55 ⇒ P≈0.55 ⇒ acoso-parcial ⇒ 1
  { name: "triad-close",   dists: [30, 30, 30],           players: 2, w: 2 },   // 3 pegados (d30) ⇒ P≈0.89 ⇒ 2
  { name: "penta-edge",    dists: [270, 270, 270, 270, 270], players: 2, w: 0 },// 5 en el borde ⇒ P≈0.09 ⇒ 0
  { name: "pair-<minMobs", dists: [30, 30],               players: 2, w: 0 },   // 🔑 N2 <minMobs3 ⇒ degenerado ⇒ 0
  { name: "close-single-player", dists: [45, 45, 45, 45], players: 1, w: 0 },   // 🔑 single-player (P1) ⇒ degenerado ⇒ 0 (colapso LIMPIO)
];
// drivePressure REAL: inyecta party sintética (P=hero+extra) + mobs a DISTANCIAS dadas; P server-auth. Requiere ≥minMobs(3) y ≥minPlayers(2).
const EXPECT_DRIVE = [
  { name: "point-blank-P2", players: 1, dists: [45, 45, 45, 45],   w: 2 },
  { name: "edge-P2",        players: 1, dists: [255, 255, 255, 255], w: 0 },
  { name: "some-P2",        players: 1, dists: [135, 135, 135, 135], w: 1 },
  { name: "single-player",  players: 0, dists: [45, 45, 45, 45],   w: 0 },     // 🔑 P1 (sólo héroe) ⇒ 0
  { name: "2mob-<minMobs",  players: 1, dists: [30, 30],           w: 0 },     // N2 <minMobs3 ⇒ 0
];
const PLAYER_OFF = [[44, 0], [0, 44], [-44, 0], [30, 30], [-30, 30]];   // offsets de jugadores sintéticos (dentro de radio 300)
// distPts: mobs a DISTANCIAS dadas, repartidos angularmente parejo (el ángulo NO afecta P — pressure es radial). deg sólo posiciona.
const distPts = (dists) => dists.map((dist, i) => ({ deg: Math.round(360 * i / Math.max(1, dists.length)), dist, type: "rat", state: "chase" }));

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.aggroPressure && window.__dev.aggroSurround && window.__dev.aggroMomentum && window.__dev.aggroDensity && window.__dev.converge && window.__dev.aggroPile && window.__dev.aggroContest && window.__dev.targetSpread && window.__dev.aggroFocus && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.aggroPressure + peer hooks (aggroSurround/aggroMomentum/aggroDensity/converge/aggroPile/aggroContest/targetSpread/aggroFocus) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.aggroPressure());
  ok("2 byte-id OFF (fresh boot): AGGRO_PRESSURE_SURGE.enabled false AND G.aggroPressureBounty NUNCA se crea (gExists false) AND G._prsParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.engaged === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "aggroPressureFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} engaged=${dark.engaged} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiPress=${dark.hiPress} midPress=${dark.midPress} closeBins=${dark.closeBins} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no aggroPressureFind/aggroPressureBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(aggroPressureFind|aggroPressureBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"aggroPressureBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'aggroPressureFind'/'aggroPressureBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroPressure({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroPressure({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ pressureProbe LUT: (dists,players)→N→Σ cercanía ENTERA→P=sum/(N·Q)→banda(sumas ENTERAS)→tier→charge (UMBRALES hiPress/midPress + colapso single-player + minMobs).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.aggroPressure({ pressureProbe: { dists: c.dists, players: c.players } }).pressureProbe), EXPECT_PRESSURE);
  const tabOK = EXPECT_PRESSURE.every((c, i) => tab[i] && tab[i].weight === c.w);
  ok("5 ★ pressureProbe LUT (CERCANÍA RADIAL P=mean((R−d)/R)): point-blank(d45)⇒P≈0.84/w2, edge(d255)⇒P≈0.14/w0 (MISMO N, radial opuesto), some(d135)⇒w1, triad-close⇒w2, penta-edge⇒w0, pair⇒N2<minMobs⇒0, close-single-player⇒0. UMBRAL hiPress 0.75/midPress 0.5",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_PRESSURE[i].name, n: x.total, P: x.pressure, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH ACOSO: drivePressure inyecta party sintética + mobs a DISTANCIAS dadas ⇒ P REAL server-auth.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, PLAYER_OFF } = args;
    const distPts = (dists) => dists.map((dist, i) => ({ deg: Math.round(360 * i / Math.max(1, dists.length)), dist, type: "rat", state: "chase" }));
    window.__dev.aggroPressure({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.aggroPressure({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, c.players).map(([dx, dy]) => ({ dx, dy }));
      const dv = window.__dev.aggroPressure({ drivePressure: { players, pts: distPts(c.dists), wipe: true } }).drivePressure;
      const live = window.__dev.aggroPressure({ pressureProbeLive: true }).pressureProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvEngaged: dv.engaged, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, engaged: live.engaged, livePlayers: live.players });
    }
    window.__dev.aggroPressure({ clearPressure: true });
    window.__dev.aggroPressure({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w);
  ok("5b ★ REAL SERVER-AUTH ACOSO (hero+mob pos snapshot): point-blank(P2)=w2, edge(P2)=w0, some(P2)=w1, single-player(P1)=0, 2mob(<minMobs)=0",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA) ⊥#129 SURROUND (RADIAL vs ANGULAR — los DOS componentes ortogonales de la geometría del pack): MISMO N=4, anillo-al-borde (S=hi/P=lo) vs un-lado-quemarropa (S=0/P=hi) ⇒ DISOCIAN.
  const cruxAng = await page.evaluate(() => {
    const prsW = (dists, P) => window.__dev.aggroPressure({ pressureProbe: { dists, players: P } }).pressureProbe.weight;
    const surW = (bearings, P) => window.__dev.aggroSurround({ surroundProbe: { bearings, players: P } }).surroundProbe.weight;
    // ring-at-edge: 4 a 90° (S=1 cercado ANGULAR) todos en el borde d270 (P≈0.09 con-sitio RADIAL)
    const ringAtEdge = { sur: surW([0, 90, 180, 270], 2), prs: prsW([270, 270, 270, 270], 2) };
    // one-side-point-blank: 4 amontonados a un rumbo (S≈0 un-solo-lado ANGULAR) a quemarropa d30 (P≈0.89 apretado RADIAL)
    const oneSidePointBlank = { sur: surW([0, 8, -8, 4], 2), prs: prsW([30, 30, 30, 30], 2) };
    return { ringAtEdge, oneSidePointBlank };
  });
  const cruxAngOK = cruxAng.ringAtEdge.sur === 2 && cruxAng.ringAtEdge.prs === 0        // cercado angular, con-sitio radial
    && cruxAng.oneSidePointBlank.sur === 0 && cruxAng.oneSidePointBlank.prs === 2;      // un-solo-lado angular, apretado radial
  ok("6 ★ CRUX (LA CRÍTICA) ⊥#129 SURROUND (RADIAL ⊥ ANGULAR — los DOS componentes ortogonales): anillo-al-borde ⇒ SURROUND 2/PRESSURE 0 vs un-lado-quemarropa ⇒ SURROUND 0/PRESSURE 2 (MISMO N=4, geometría descompuesta en angular vs radial) ⇒ DISOCIAN",
     cruxAngOK, JSON.stringify(cruxAng));

  // 6b ★ CRUX ⊥#126 DENSITY (RADIAL-cercanía vs MAGNITUD-N): N=6 al borde (density hi, P lo) vs N=3 a quemarropa (density menor, P hi). P invariante a N; density crece con N/P.
  const cruxDens = await page.evaluate(() => {
    const prs = (dists, P) => window.__dev.aggroPressure({ pressureProbe: { dists, players: P } }).pressureProbe.weight;
    const dens = (counts, P) => window.__dev.aggroDensity({ densityProbe: { counts, players: P } }).densityProbe.weight;
    const sixEdge = { prs: prs([255, 255, 255, 255, 255, 255], 2), dens: dens([6], 2) };   // N6 borde: P lo, density hi
    const triClose = { prs: prs([30, 30, 30], 2), dens: dens([3], 2) };                     // N3 quemarropa: P hi, density lo
    return { sixEdge, triClose };
  });
  const cruxDensOK = cruxDens.sixEdge.prs === 0 && cruxDens.triClose.prs === 2       // pressure OPUESTO (N6-edge 0 vs N3-close 2)
    && cruxDens.sixEdge.dens >= cruxDens.triClose.dens;                              // density MISMA-dirección con N (N6 ≥ N3)
  ok("6b ★ CRUX ⊥#126 DENSITY (RADIAL-cercanía ⊥ MAGNITUD-N): N6-al-borde ⇒ PRESSURE 0/density-hi vs N3-quemarropa ⇒ PRESSURE 2/density-lo (P invariante a N; density crece con N/P) ⇒ DISOCIAN",
     cruxDensOK, JSON.stringify(cruxDens));

  // 7 ★ CRUX ⊥#112 CONVERGE (RADIAL-POSICIÓN-estática vs VELOCIDAD-radial): motion-invariance. MISMAS distancias point-blank, mobs MOVIÉNDOSE (chase) vs INMÓVILES (windup) ⇒ MISMO P (pressure lee sólo POSICIÓN, 0 dependencia del movimiento; converge lee closing-speed).
  const cruxConv = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    window.__dev.aggroPressure({ enabled: true });
    const drive = (state) => { window.__dev.aggroPressure({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2
      const pts = [0, 90, 180, 270].map((deg) => ({ deg, dist: 30, type: "rat", state }));   // point-blank d30
      const dv = window.__dev.aggroPressure({ drivePressure: { players, pts, wipe: true } }).drivePressure;
      return { idx: dv.idx, score: dv.score, engaged: dv.engaged }; };
    const moving = drive("chase");     // en movimiento (converge>0 si cierra)
    const still = drive("windup");     // INMÓVIL (converge=0) — MISMA posición point-blank
    window.__dev.aggroPressure({ clearPressure: true });
    window.__dev.aggroPressure({ enabled: false });
    return { moving, still };
  }, { Z, PLAYER_OFF });
  const cruxConvOK = cruxConv.moving.score === cruxConv.still.score && cruxConv.moving.idx === cruxConv.still.idx && cruxConv.moving.score === 2 && cruxConv.moving.engaged === 4;
  ok("7 ★ CRUX ⊥#112 CONVERGE (POSICIÓN-radial-ESTÁTICA ⊥ VELOCIDAD-radial): MISMO point-blank en movimiento (chase) vs INMÓVIL (windup) ⇒ MISMO P/score2 (pressure = cuán cerca AHORA, motion-invariant; converge = closing-speed) ⇒ DISOCIAN",
     cruxConvOK, JSON.stringify(cruxConv));

  // 8 ★ ANGULAR-INVARIANCE (P = radial, ⊥ orientación angular): MISMAS distancias en bearings MUY distintos ⇒ MISMO P (el complemento del ⊥#129).
  const angInv = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    window.__dev.aggroPressure({ enabled: true });
    const drive = (bearings) => { window.__dev.aggroPressure({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2
      const pts = bearings.map((deg) => ({ deg, dist: 60, type: "rat", state: "chase" }));   // MISMA dist 60, bearings variados
      const dv = window.__dev.aggroPressure({ drivePressure: { players, pts, wipe: true } }).drivePressure;
      return { idx: dv.idx, score: dv.score, engaged: dv.engaged }; };
    const ring = drive([0, 90, 180, 270]);        // 4 repartidos 360°
    const oneSide = drive([0, 8, -8, 4]);          // 4 amontonados a un lado — MISMA dist
    window.__dev.aggroPressure({ clearPressure: true });
    window.__dev.aggroPressure({ enabled: false });
    return { ring, oneSide };
  }, { Z, PLAYER_OFF });
  const angInvOK = angInv.ring.score === angInv.oneSide.score && angInv.ring.idx === angInv.oneSide.idx && angInv.ring.score === 2;
  ok("8 ★ ANGULAR-INVARIANCE (P RADIAL ⊥ ángulo): MISMAS 4 distancias (d60) repartidas 360° vs amontonadas a un lado ⇒ MISMO P/score2 (pressure lee sólo cuán LEJOS, no de qué lado — complemento del ⊥#129)",
     angInvOK, JSON.stringify(angInv));

  // 9 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: mismos mobs a quemarropa, SIN party (P=1) ⇒ P=0; CON party (P≥2) ⇒ P>0.
  const degen = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const distPts = (dists) => dists.map((dist, i) => ({ deg: Math.round(360 * i / Math.max(1, dists.length)), dist, type: "rat", state: "chase" }));
    window.__dev.aggroPressure({ enabled: true });
    const drive = (nPlayers, dists) => { window.__dev.aggroPressure({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, nPlayers).map(([dx, dy]) => ({ dx, dy }));
      const dv = window.__dev.aggroPressure({ drivePressure: { players, pts: distPts(dists), wipe: true } }).drivePressure;
      const live = window.__dev.aggroPressure({ pressureProbeLive: true }).pressureProbeLive;
      return { idx: dv.idx, score: dv.score, players: live.players, engaged: live.engaged }; };
    const pointBlank = [45, 45, 45, 45];
    const sp = drive(0, pointBlank);   // single-player: P=1 ⇒ P=0 (colapso)
    const mp = drive(1, pointBlank);   // multijugador P2 ⇒ P>0/score2 (bien-definido)
    window.__dev.aggroPressure({ clearPressure: true });
    window.__dev.aggroPressure({ enabled: false });
    return { sp, mp };
  }, { Z, PLAYER_OFF });
  const degenOK = degen.sp.players === 1 && degen.sp.idx === 0 && degen.sp.score === 0 && degen.mp.players === 2 && degen.mp.engaged === 4 && degen.mp.score === 2 && degen.mp.idx > 0.75;
  ok("9 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: mismo acoso (4 point-blank) SIN party (P=1) ⇒ P=0/score0; CON party (P=2) ⇒ P>0.75/score2 ⇒ colapsa LIMPIO y se ilumina sólo con party genuina",
     degenOK, JSON.stringify(degen));

  // 10 ★ INTEGER-DETERMINISM: dos pressureProbe idénticos ⇒ P/sum/w byte-idénticos (niveles de cercanía enteros + banda de sumas entera, 0-float en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.aggroPressure({ pressureProbe: { dists: [37, 91, 143, 210, 268], players: 2 } }).pressureProbe;
    const b = window.__dev.aggroPressure({ pressureProbe: { dists: [37, 91, 143, 210, 268], players: 2 } }).pressureProbe;
    return { a: { P: a.pressure, sum: a.sum, w: a.weight }, b: { P: b.pressure, sum: b.sum, w: b.weight } };
  });
  const detOK = det.a.P === det.b.P && det.a.sum === det.b.sum && det.a.w === det.b.w;
  ok("10 ★ INTEGER-DETERMINISM: pressureProbe repetido ⇒ P/sum/weight byte-idénticos (Σ cercanía ENTERA + banda de sumas entera ⇒ 0-float sqrt en el score/decisión)",
     detOK, JSON.stringify(det));

  // 11 CANAL aggroPressureFind: forageChargePreview con acoso >0 ; con-sitio → 0
  const forage = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const distPts = (dists) => dists.map((dist, i) => ({ deg: Math.round(360 * i / Math.max(1, dists.length)), dist, type: "rat", state: "chase" }));
    window.__dev.aggroPressure({ enabled: true });
    window.__dev.aggroPressure({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2
    window.__dev.aggroPressure({ drivePressure: { players, pts: distPts([45, 45, 45, 45]), wipe: true } });   // apretado ⇒ score2 ⇒ T2
    const actVm = window.__dev.aggroPressure();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.aggroPressure({ drivePressure: { players, pts: distPts([255, 255, 255, 255]), wipe: true } });   // borde ⇒ score0
    const goVm = window.__dev.aggroPressure();
    window.__dev.aggroPressure({ clearPressure: true });
    window.__dev.aggroPressure({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, PLAYER_OFF });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("11 CANAL aggroPressureFind: forageChargePreview apretado (P>0.75) ⇒ charge>0 (==aggroPressureBonus); con borde (con-sitio) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 12 ★ SUB-CAP: charge never exceeds aggroPressureBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let k = 3; k <= 12; k++) { const dists = []; for (let i = 0; i < k; i++) dists.push(15); vals.push(window.__dev.aggroPressure({ pressureProbe: { dists, players: 2 } }).pressureProbe.charge); }  // k mobs a quemarropa ⇒ P≈1
    return { max: Math.max(...vals), cap: window.__dev.aggroPressure().cap };
  });
  ok("12 ★ SUB-CAP: ningún acoso produce charge>aggroPressureBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 13 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full pressure pack available
  const neutral = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const distPts = (dists) => dists.map((dist, i) => ({ deg: Math.round(360 * i / Math.max(1, dists.length)), dist, type: "rat", state: "chase" }));
    window.__dev.aggroPressure({ enabled: true });
    window.__dev.aggroPressure({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.aggroPressure({ drivePressure: { players, pts: distPts([30, 30, 30, 30]), wipe: true } });   // acoso disponible
    window.__dev.aggroPressure({ enabled: false });                          // now OFF
    const off = window.__dev.aggroPressure();
    window.__dev.aggroPressure({ enabled: true }); window.__dev.aggroPressure({ clearPressure: true }); window.__dev.aggroPressure({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, engaged: off.engaged };
  }, { Z, PLAYER_OFF });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.engaged === 0;
  ok("13 ★ BYTE-NEUTRAL OFF: con OFF, aggroPressureBonus(acoso disponible)==0 + forageChargePreview==0 + idx==0 + engaged==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 14 ★ ORTHOGONALITY: toggling aggroSurround/aggroDensity/aggroPile/aggroContest/targetSpread/aggroFocus no cambia la señal de aggroPressure.
  const orth = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const distPts = (dists) => dists.map((dist, i) => ({ deg: Math.round(360 * i / Math.max(1, dists.length)), dist, type: "rat", state: "chase" }));
    window.__dev.aggroPressure({ enabled: true });
    window.__dev.aggroPressure({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    const before = window.__dev.aggroPressure({ drivePressure: { players, pts: distPts([30, 30, 30, 30]), wipe: true } }).drivePressure;
    const snap = () => JSON.stringify({ aggroSurround: window.__dev.aggroSurround(), aggroDensity: window.__dev.aggroDensity(), aggroPile: window.__dev.aggroPile(), aggroContest: window.__dev.aggroContest(), targetSpread: window.__dev.targetSpread(), aggroFocus: window.__dev.aggroFocus() });
    const peersOn = snap();
    const asPrev = window.__dev.aggroSurround().enabled, adPrev = window.__dev.aggroDensity().enabled, apPrev = window.__dev.aggroPile().enabled, acPrev = window.__dev.aggroContest().enabled, tsPrev = window.__dev.targetSpread().enabled, afPrev = window.__dev.aggroFocus().enabled;
    window.__dev.aggroSurround({ enabled: !asPrev }); window.__dev.aggroDensity({ enabled: !adPrev }); window.__dev.aggroPile({ enabled: !apPrev }); window.__dev.aggroContest({ enabled: !acPrev }); window.__dev.targetSpread({ enabled: !tsPrev }); window.__dev.aggroFocus({ enabled: !afPrev });
    const after = window.__dev.aggroPressure({ pressureProbeLive: true }).pressureProbeLive;
    window.__dev.aggroSurround({ enabled: asPrev }); window.__dev.aggroDensity({ enabled: adPrev }); window.__dev.aggroPile({ enabled: apPrev }); window.__dev.aggroContest({ enabled: acPrev }); window.__dev.targetSpread({ enabled: tsPrev }); window.__dev.aggroFocus({ enabled: afPrev });
    const peersRestored = snap();
    window.__dev.aggroPressure({ clearPressure: true });
    window.__dev.aggroPressure({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.engaged === after.engaged;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeEngaged: before.engaged, afterEngaged: after.engaged };
  }, { Z, PLAYER_OFF });
  ok("14 ★ ORTOGONALIDAD aggroPressureFind ⊥ peers: la señal de acoso (score/engaged) NO cambia al togglear AGGRO-SURROUND #129/AGGRO-DENSITY #126/AGGRO-PILE #124/AGGRO-CONTEST #123/TARGET-SPREAD #121/AGGRO-FOCUS #118; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION CENSUS: served config — 58 `_SURGE` totales, sole-false = AGGRO_PRESSURE (57 true, incl. AGGRO_SURROUND #129 + AGGRO_MOMENTUM #128 LIVE).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const aggroSurroundLive = census.find(([n]) => n === "AGGRO_SURROUND_SURGE");
  const aggroMomentumLive = census.find(([n]) => n === "AGGRO_MOMENTUM_SURGE");
  const censusOK = total === 58 && trues === 57 && falses.length === 1 && falses[0] === "AGGRO_PRESSURE_SURGE" && aggroSurroundLive && aggroSurroundLive[1] === "true" && aggroMomentumLive && aggroMomentumLive[1] === "true";
  ok("15 ★ 0-REGRESIÓN CENSUS: served config 58 `_SURGE` totales, 57 enabled:true (incl. AGGRO_SURROUND_SURGE #129 + AGGRO_MOMENTUM_SURGE #128 LIVE), sole-false = AGGRO_PRESSURE_SURGE (DARK #130)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} aggroSurround=${aggroSurroundLive ? aggroSurroundLive[1] : "?"} aggroMomentum=${aggroMomentumLive ? aggroMomentumLive[1] : "?"}`);

  // 16 render badge "Acoso:" drawn ON+apretado / not OFF + fps. 🔑 label ÚNICO "Acoso:" (⊥ #129 'Rodeo:').
  const badge = await page.evaluate(async (args) => {
    const { Z, PLAYER_OFF } = args;
    const distPts = (dists) => dists.map((dist, i) => ({ deg: Math.round(360 * i / Math.max(1, dists.length)), dist, type: "rat", state: "chase" }));
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    const drive = () => window.__dev.aggroPressure({ drivePressure: { players, pts: distPts([30, 30, 30, 30]), wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Apremio:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.aggroPressure({ enabled: true });
    window.__dev.aggroPressure({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.aggroPressure({ clearPressure: true });
    window.__dev.aggroPressure({ enabled: false });
    const enAtOff = window.__dev.aggroPressure().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, PLAYER_OFF });
  ok("16 render badge \"Apremio:\" se DIBUJA ON+apretado (P>0, re-driven cada frame) y NO OFF (P 0) + fps sano (label ÚNICO ⊥ #94/#118 'Rodeo:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, PLAYER_OFF } = args; const distPts = (dists) => dists.map((dist, i) => ({ deg: Math.round(360 * i / Math.max(1, dists.length)), dist, type: "rat", state: "chase" })); const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy })); window.__dev.aggroPressure({ enabled: true }); window.__dev.aggroPressure({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.aggroPressure({ drivePressure: { players, pts: distPts([30, 30, 30, 30]), wipe: true } }); }, { Z, PLAYER_OFF });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.aggroPressure({ clearPressure: true }); window.__dev.aggroPressure({ enabled: false }); });

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
    const distPts = (dists) => dists.map((dist, i) => ({ deg: Math.round(360 * i / Math.max(1, dists.length)), dist, type: "rat", state: "chase" }));
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2, 4 point-blank ⇒ P hi ⇒ score2
    window.__dev.aggroPressure({ enabled: true });
    window.__dev.aggroPressure({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.aggroPressure({ drivePressure: { players, pts: distPts([30, 30, 30, 30]), wipe: true } }).drivePressure;
    const vm = window.__dev.aggroPressure();
    const lut = [[[45, 45, 45, 45], 2], [[255, 255, 255, 255], 2], [[135, 135, 135, 135], 2], [[30, 30, 30], 2]].map(([dists, P]) => { const m = window.__dev.aggroPressure({ pressureProbe: { dists, players: P } }).pressureProbe; return { n: m.total, P: m.pressure, sum: m.sum, tier: m.tier, charge: m.charge }; });
    const live = window.__dev.aggroPressure({ pressureProbeLive: true }).pressureProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.aggroPressure({ clearPressure: true });
    window.__dev.aggroPressure({ enabled: false });
    return { score: dv.score, idx: dv.idx, engaged: dv.engaged, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveEngaged: live.engaged, players: live.players, lut, fp };
  }, { Z, FPARG, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.engaged === B.engaged && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveEngaged === B.liveEngaged && A.players === B.players && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("17 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMA party+mobs point-blank (P2, N4, P=hi apretado)+héroe ⇒ score/idx/engaged/tier/charge + pressureProbeLive(field,engaged,players,score) + pressureProbe LUT (P/sum enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},engaged:${A.engaged},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveEngaged:${A.liveEngaged},players:${A.players},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},engaged:${B.engaged},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveEngaged:${B.liveEngaged},players:${B.players},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.aggroPressure({ enabled: false }));
  await pageB.evaluate(() => window.__dev.aggroPressure({ enabled: false }));

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
