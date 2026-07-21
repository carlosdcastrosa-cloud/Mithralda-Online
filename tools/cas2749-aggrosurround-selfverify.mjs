// CAS-2749 — self-verify for CERCO (DARK, AGGRO_SURROUND_SURGE.enabled:false). EVO mecánica #129 (serializa tras #128 AGGRO_MOMENTUM_SURGE LIVE&served 00bb0660d3e1/815, base master 0e25cad) — EJE FRESCO + CANAL FRESCO, ⊥ a las 70 LIVE #59-#128. El 11º eje de COMPOSICIÓN-DE-INTENCIÓN y el ESPACIAL-GEOMÉTRICO: DÓNDE se sienta el enjambre ENGANCHADO alrededor del héroe (encirclement angular), no cuántos (#126) ni de qué tipo (#127) ni si crece (#128).
// (A) EJE FRESCO = CERCO/geometría = aggroSurroundField(hero) = S = 1 − R, con R = |vector resultante MEDIO| de los RUMBOS (hero→mob) de los mobs ALIVE ENGANCHADOS en radio. SNAPSHOT PURO (lee hero+mob pos directo, SIN buffer temporal, como #121/#123/…/#127). 🔑 DETERMINISMO (sev-1): rumbos CUANTIZADOS a bins ENTEROS (angleBins 64) vía atan2→bin; resultante sumada de un LUT ENTERO (cos/sin ×1000); banda por comparación ENTERA de R². Bandas sobre S: ≥hiSurround(0.75) ⇒ cercado ⇒ 2; ≥midSurround(0.5) ⇒ cerco-parcial ⇒ 1; <mid (un-solo-lado) ⇒ 0. Requiere ≥minMobs(3) y ≥minPlayers(2). 🔑 INTRÍNSECAMENTE MULTIJUGADOR: single-player ⇒ P<2 ⇒ S=0 (colapso LIMPIO).
//     CRUX (LA CRÍTICA) — GEOMETRÍA (dónde) ⊥ TODOS los priores (cuántos/qué/tendencia): 4 mobs en CÚMULO a un rumbo (S≈0) vs 4 mobs a 90° (S≈1) ⇒ MISMO conteo/DENSITY #126/VARIETY #127, geometría OPUESTA. ⊥#128 MOMENTUM (anillo estable S-hi/M0 vs un-lado creciendo S0/M-hi). ⊥#113 ENCIRCLE (todos los mobs vivos; SURROUND sólo enganchados + party-gate).
// (B) CANAL FRESCO = aggroSurroundFind (fichas de cerco por rematar CERCADO — NINGUNA de las 70 flags lo usa). Moneda FRESCA (h.aggroSurroundBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//
// Run: node tools/cas2749-aggrosurround-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2749");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// surroundProbe LUT esperada: (bearings deg, players)→N=len→resultante entera (bin+LUT)→S=1−R→banda(R² entera)→{weight,tier}. UMBRALES hiSurround 0.75 / midSurround 0.5 + colapso single-player (P<2 ⇒ 0) + minMobs (N<3 ⇒ 0). Casos ELEGIDOS lejos de los umbrales.
const EXPECT_SURROUND = [
  { name: "clustered-1side",  bearings: [0, 8, -8, 4],          players: 2, w: 0 },   // 4 mobs en CÚMULO a ~1 rumbo ⇒ R≈1 ⇒ S≈0 ⇒ un-solo-lado ⇒ 0
  { name: "perpendicular",    bearings: [0, 90, 180, 270],      players: 2, w: 2 },   // 4 a 90° ⇒ R=0 ⇒ S=1 ⇒ cercado ⇒ 2 (MISMO N que el cúmulo, geometría opuesta)
  { name: "triad-even",       bearings: [0, 120, 240],          players: 2, w: 2 },   // 3 a 120° ⇒ R=0 ⇒ S=1 ⇒ 2
  { name: "half-arc",         bearings: [0, 60, 120, 180],      players: 2, w: 1 },   // spread sobre 180° ⇒ R≈0.43 ⇒ S≈0.57 ⇒ cerco-parcial ⇒ 1
  { name: "penta-even",       bearings: [0, 72, 144, 216, 288], players: 2, w: 2 },   // 5 parejo ⇒ R=0 ⇒ S=1 ⇒ 2
  { name: "tight-arc",        bearings: [0, 30, 60, 90],        players: 2, w: 0 },   // 4 en arco de 90° ⇒ R≈0.84 ⇒ S≈0.16 ⇒ un-solo-lado ⇒ 0
  { name: "pair-<minMobs",    bearings: [0, 180],               players: 2, w: 0 },   // 🔑 N2 <minMobs3 ⇒ degenerado ⇒ 0
  { name: "perp-single-player", bearings: [0, 90, 180, 270],    players: 1, w: 0 },   // 🔑 single-player (P1) ⇒ degenerado ⇒ 0 (colapso LIMPIO)
];
// driveSurround REAL: inyecta party sintética (P=hero+extra) + mobs en RUMBOS dados; S=1−R server-auth. Requiere ≥minMobs(3) y ≥minPlayers(2).
const EXPECT_DRIVE = [
  { name: "clustered-P2", players: 1, bearings: [0, 8, -8, 4],     w: 0 },
  { name: "perp-P2",      players: 1, bearings: [0, 90, 180, 270], w: 2 },
  { name: "half-P2",      players: 1, bearings: [0, 60, 120, 180], w: 1 },
  { name: "single-player", players: 0, bearings: [0, 90, 180, 270], w: 0 },   // 🔑 P1 (sólo héroe) ⇒ 0
  { name: "2mob-<minMobs", players: 1, bearings: [0, 180],         w: 0 },     // N2 <minMobs3 ⇒ 0
];
const PLAYER_OFF = [[44, 0], [0, 44], [-44, 0], [30, 30], [-30, 30]];   // offsets de jugadores sintéticos (dentro de radio 300)
const bearPts = (bearings) => bearings.map((deg) => ({ deg, dist: 120, type: "rat", state: "chase" }));

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.aggroSurround && window.__dev.aggroMomentum && window.__dev.aggroVariety && window.__dev.aggroDensity && window.__dev.aggroPile && window.__dev.aggroContest && window.__dev.targetSpread && window.__dev.aggroFocus && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.aggroSurround + peer hooks (aggroMomentum/aggroVariety/aggroDensity/aggroPile/aggroContest/targetSpread/aggroFocus/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.aggroSurround());
  ok("2 byte-id OFF (fresh boot): AGGRO_SURROUND_SURGE.enabled false AND G.aggroSurroundBounty NUNCA se crea (gExists false) AND G._surParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.engaged === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "aggroSurroundFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} engaged=${dark.engaged} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiSurround=${dark.hiSurround} midSurround=${dark.midSurround} angleBins=${dark.angleBins} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no aggroSurroundFind/aggroSurroundBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(aggroSurroundFind|aggroSurroundBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"aggroSurroundBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'aggroSurroundFind'/'aggroSurroundBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroSurround({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroSurround({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ surroundProbe LUT: (bearings,players)→N→resultante entera→S=1−R→banda(R² entera)→tier→charge (UMBRALES hiSurround/midSurround + colapso single-player + minMobs).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.aggroSurround({ surroundProbe: { bearings: c.bearings, players: c.players } }).surroundProbe), EXPECT_SURROUND);
  const tabOK = EXPECT_SURROUND.every((c, i) => tab[i] && tab[i].weight === c.w);
  ok("5 ★ surroundProbe LUT (GEOMETRÍA S=1−R): cúmulo-1-lado⇒w0, perpendicular(90°)⇒S1/w2 (MISMO N que el cúmulo, geometría opuesta), triad-even⇒w2, half-arc⇒w1, penta-even⇒w2, tight-arc⇒w0, pair⇒N2<minMobs⇒0, perp-single-player⇒0. UMBRAL hiSurround 0.67/midSurround 0.34",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_SURROUND[i].name, n: x.total, S: x.surround, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH CERCO: driveSurround inyecta party sintética + mobs en RUMBOS dados ⇒ S=1−R REAL server-auth.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, PLAYER_OFF } = args;
    const bearPts = (bearings) => bearings.map((deg) => ({ deg, dist: 120, type: "rat", state: "chase" }));
    window.__dev.aggroSurround({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.aggroSurround({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, c.players).map(([dx, dy]) => ({ dx, dy }));
      const dv = window.__dev.aggroSurround({ driveSurround: { players, pts: bearPts(c.bearings), wipe: true } }).driveSurround;
      const live = window.__dev.aggroSurround({ surroundProbeLive: true }).surroundProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvEngaged: dv.engaged, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, engaged: live.engaged, livePlayers: live.players });
    }
    window.__dev.aggroSurround({ clearSurround: true });
    window.__dev.aggroSurround({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w);
  ok("5b ★ REAL SERVER-AUTH CERCO (hero+mob pos snapshot): clustered(P2)=w0, perp(P2)=w2, half(P2)=w1, single-player(P1)=0, 2mob(<minMobs)=0",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA) ⊥#126 DENSITY / ⊥#127 VARIETY (GEOMETRÍA vs conteo/tipo): MISMO N (4) + MISMO tipo (monotipo), geometría OPUESTA ⇒ surround DISOCIA.
  const cruxGeo = await page.evaluate(() => {
    const surW = (bearings, P) => window.__dev.aggroSurround({ surroundProbe: { bearings, players: P } }).surroundProbe.weight;
    const densW = (counts, P) => window.__dev.aggroDensity({ densityProbe: { counts, players: P } }).densityProbe.weight;
    const varW = (types, P) => window.__dev.aggroVariety({ varietyProbe: { types, players: P } }).varietyProbe.weight;
    // N=4 monotipo en ambos ⇒ density (N/P) y variety (K=1) IDÉNTICOS; surround OPUESTO por bearings
    const clustered = { sur: surW([0, 8, -8, 4], 2), dens: densW([4], 2), var: varW(["rat", "rat", "rat", "rat"], 2) };
    const perp = { sur: surW([0, 90, 180, 270], 2), dens: densW([4], 2), var: varW(["rat", "rat", "rat", "rat"], 2) };
    return { clustered, perp };
  });
  const cruxGeoOK = cruxGeo.clustered.dens === cruxGeo.perp.dens        // MISMA densidad
    && cruxGeo.clustered.var === cruxGeo.perp.var                       // MISMA variedad (monotipo)
    && cruxGeo.clustered.sur !== cruxGeo.perp.sur                       // SURROUND opuesto
    && cruxGeo.clustered.sur === 0 && cruxGeo.perp.sur === 2;
  ok("6 ★ CRUX (LA CRÍTICA) ⊥#126 DENSITY/⊥#127 VARIETY (GEOMETRÍA vs conteo/tipo): 4 mobs CÚMULO⇒SURROUND 0 vs 4 mobs 90°⇒SURROUND 2 (MISMO N/densidad, MISMO tipo/variedad, geometría OPUESTA) ⇒ DISOCIAN",
     cruxGeoOK, JSON.stringify(cruxGeo));

  // 6b ★ CRUX ⊥#128 MOMENTUM (GEOMETRÍA-ANGULAR vs TENDENCIA-CON-SIGNO): anillo ESTABLE (S-hi, M=0) vs un-lado CRECIENDO (S=0, M-hi). SURROUND lee DÓNDE están (snapshot angular); MOMENTUM lee si CRECE (dN/dt). Un anillo 360° estable (N constante) ⇒ cercado pero 0 momentum; un cúmulo a un lado que crece 2→6 ⇒ 0 cerco pero momentum máximo ⇒ DISOCIAN.
  const cruxMom = await page.evaluate(() => {
    const surW = (bearings) => window.__dev.aggroSurround({ surroundProbe: { bearings, players: 2 } }).surroundProbe.weight;
    const momW = (samples) => window.__dev.aggroMomentum({ momentumProbe: { samples, players: 2 } }).momentumProbe.weight;
    // steady-ring: 4 mobs a 90° (S=1 cercado) + N constante en el tiempo (rawM=0 ⇒ M0)
    const steadyRing = { sur: surW([0, 90, 180, 270]), mom: momW([6, 6, 6, 6, 6]) };
    // growing-one-side: 4 mobs amontonados a un rumbo (S≈0 un-solo-lado) + N creciendo 2→6 (rawM=4 ⇒ M-hi)
    const growingOneSide = { sur: surW([0, 8, -8, 4]), mom: momW([2, 3, 4, 5, 6]) };
    return { steadyRing, growingOneSide };
  });
  const cruxMomOK = cruxMom.steadyRing.sur === 2 && cruxMom.steadyRing.mom === 0        // cercado, sin crecer
    && cruxMom.growingOneSide.sur === 0 && cruxMom.growingOneSide.mom === 2;            // creciendo, sin cercar
  ok("6b ★ CRUX ⊥#128 MOMENTUM (GEOMETRÍA-ANGULAR vs dN/dt): anillo ESTABLE ⇒ SURROUND 2/MOMENTUM 0 vs un-lado CRECIENDO ⇒ SURROUND 0/MOMENTUM 2 (cerco angular ⊥ tendencia con signo del CONTEO) ⇒ DISOCIAN",
     cruxMomOK, JSON.stringify(cruxMom));

  // 7 ★ ⊥ distancia/magnitud del rumbo (S es DIRECCIONAL, no radial): mismos RUMBOS a distancias MUY distintas ⇒ MISMO S (driveSurround con dist variado).
  const cruxDist = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    window.__dev.aggroSurround({ enabled: true });
    const drive = (dists) => { window.__dev.aggroSurround({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2
      const pts = [0, 90, 180, 270].map((deg, i) => ({ deg, dist: dists[i], type: "rat", state: "chase" }));
      const dv = window.__dev.aggroSurround({ driveSurround: { players, pts, wipe: true } }).driveSurround;
      return { idx: dv.idx, score: dv.score, engaged: dv.engaged }; };
    const near = drive([60, 60, 60, 60]);       // mismos rumbos, distancia uniforme cercana
    const mixed = drive([60, 200, 90, 250]);     // MISMOS rumbos, distancias MUY dispares
    window.__dev.aggroSurround({ clearSurround: true });
    window.__dev.aggroSurround({ enabled: false });
    return { near, mixed };
  }, { Z, PLAYER_OFF });
  const cruxDistOK = cruxDist.near.score === cruxDist.mixed.score && cruxDist.near.score === 2 && Math.abs(cruxDist.near.idx - cruxDist.mixed.idx) < 0.01;
  ok("7 ★ ⊥ distancia (S DIRECCIONAL, no radial): mismos 4 rumbos a 90° con distancias UNIFORMES vs MUY DISPARES ⇒ MISMO S/score2 (surround lee sólo la DISTRIBUCIÓN ANGULAR, no cuán lejos)",
     cruxDistOK, JSON.stringify(cruxDist));

  // 8 ★ ROTATION-INVARIANCE (S = forma angular, no orientación absoluta): perpendicular ROTADO 37° ⇒ MISMO S (dentro del error de cuantización).
  const rot = await page.evaluate(() => {
    const sur = (bearings) => window.__dev.aggroSurround({ surroundProbe: { bearings, players: 2 } }).surroundProbe;
    const base = sur([0, 90, 180, 270]);
    const rotated = sur([37, 127, 217, 307]);   // MISMA forma (4 a 90°) rotada 37° ⇒ MISMO S
    return { base: { S: base.surround, w: base.weight }, rotated: { S: rotated.surround, w: rotated.weight } };
  });
  const rotOK = rot.base.w === rot.rotated.w && rot.base.w === 2 && Math.abs(rot.base.S - rot.rotated.S) < 0.05;
  ok("8 ★ ROTATION-INVARIANCE (S = forma angular ⊥ orientación absoluta): perpendicular vs perpendicular ROTADO 37° ⇒ MISMO S/w2 (el cerco es la uniformidad angular, no de qué lado)",
     rotOK, JSON.stringify(rot));

  // 9 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: mismos mobs cercando, SIN party (P=1) ⇒ S=0; CON party (P≥2) ⇒ S>0.
  const degen = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const bearPts = (bearings) => bearings.map((deg) => ({ deg, dist: 120, type: "rat", state: "chase" }));
    window.__dev.aggroSurround({ enabled: true });
    const drive = (nPlayers, bearings) => { window.__dev.aggroSurround({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, nPlayers).map(([dx, dy]) => ({ dx, dy }));
      const dv = window.__dev.aggroSurround({ driveSurround: { players, pts: bearPts(bearings), wipe: true } }).driveSurround;
      const live = window.__dev.aggroSurround({ surroundProbeLive: true }).surroundProbeLive;
      return { idx: dv.idx, score: dv.score, players: live.players, engaged: live.engaged }; };
    const surrounded = [0, 90, 180, 270];
    const sp = drive(0, surrounded);   // single-player: P=1 ⇒ S=0 (colapso)
    const mp = drive(1, surrounded);   // multijugador P2 ⇒ S=1/score2 (bien-definido)
    window.__dev.aggroSurround({ clearSurround: true });
    window.__dev.aggroSurround({ enabled: false });
    return { sp, mp };
  }, { Z, PLAYER_OFF });
  const degenOK = degen.sp.players === 1 && degen.sp.idx === 0 && degen.sp.score === 0 && degen.mp.players === 2 && degen.mp.engaged === 4 && degen.mp.score === 2 && Math.abs(degen.mp.idx - 1.0) < 0.01;
  ok("9 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: mismo cerco (4 a 90°) SIN party (P=1) ⇒ S=0/score0; CON party (P=2) ⇒ S=1/score2 ⇒ colapsa LIMPIO y se ilumina sólo con party genuina",
     degenOK, JSON.stringify(degen));

  // 10 ★ INTEGER-DETERMINISM: dos surroundProbe idénticos ⇒ S/w byte-idénticos (LUT entero + banda R² entera, 0-float en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.aggroSurround({ surroundProbe: { bearings: [0, 55, 143, 210, 300], players: 2 } }).surroundProbe;
    const b = window.__dev.aggroSurround({ surroundProbe: { bearings: [0, 55, 143, 210, 300], players: 2 } }).surroundProbe;
    return { a: { S: a.surround, sx: a.sx, sy: a.sy, w: a.weight }, b: { S: b.surround, sx: b.sx, sy: b.sy, w: b.weight } };
  });
  const detOK = det.a.S === det.b.S && det.a.sx === det.b.sx && det.a.sy === det.b.sy && det.a.w === det.b.w;
  ok("10 ★ INTEGER-DETERMINISM: surroundProbe repetido ⇒ S/sx/sy/weight byte-idénticos (resultante ENTERA vía LUT + banda R² entera ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 11 CANAL aggroSurroundFind: forageChargePreview con cerco >0 ; un-solo-lado → 0
  const forage = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const bearPts = (bearings) => bearings.map((deg) => ({ deg, dist: 120, type: "rat", state: "chase" }));
    window.__dev.aggroSurround({ enabled: true });
    window.__dev.aggroSurround({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2
    window.__dev.aggroSurround({ driveSurround: { players, pts: bearPts([0, 90, 180, 270]), wipe: true } });   // cercado ⇒ score2 ⇒ T2
    const actVm = window.__dev.aggroSurround();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.aggroSurround({ driveSurround: { players, pts: bearPts([0, 8, -8, 4]), wipe: true } });   // cúmulo 1-lado ⇒ score0
    const goVm = window.__dev.aggroSurround();
    window.__dev.aggroSurround({ clearSurround: true });
    window.__dev.aggroSurround({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, PLAYER_OFF });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("11 CANAL aggroSurroundFind: forageChargePreview cercado (S1) ⇒ charge>0 (==aggroSurroundBonus); con un-solo-lado ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 12 ★ SUB-CAP: charge never exceeds aggroSurroundBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let k = 3; k <= 12; k++) { const bearings = []; for (let i = 0; i < k; i++) bearings.push(Math.round(360 * i / k)); vals.push(window.__dev.aggroSurround({ surroundProbe: { bearings, players: 2 } }).surroundProbe.charge); }  // k mobs evenly ⇒ S=1
    return { max: Math.max(...vals), cap: window.__dev.aggroSurround().cap };
  });
  ok("12 ★ SUB-CAP: ningún cerco produce charge>aggroSurroundBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 13 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full surround available
  const neutral = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const bearPts = (bearings) => bearings.map((deg) => ({ deg, dist: 120, type: "rat", state: "chase" }));
    window.__dev.aggroSurround({ enabled: true });
    window.__dev.aggroSurround({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.aggroSurround({ driveSurround: { players, pts: bearPts([0, 90, 180, 270]), wipe: true } });   // cerco disponible
    window.__dev.aggroSurround({ enabled: false });                          // now OFF
    const off = window.__dev.aggroSurround();
    window.__dev.aggroSurround({ enabled: true }); window.__dev.aggroSurround({ clearSurround: true }); window.__dev.aggroSurround({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, engaged: off.engaged };
  }, { Z, PLAYER_OFF });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.engaged === 0;
  ok("13 ★ BYTE-NEUTRAL OFF: con OFF, aggroSurroundBonus(cerco disponible)==0 + forageChargePreview==0 + idx==0 + engaged==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 14 ★ ORTHOGONALITY: toggling aggroVariety/aggroDensity/aggroPile/aggroContest/targetSpread/aggroFocus no cambia la señal de aggroSurround.
  const orth = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const bearPts = (bearings) => bearings.map((deg) => ({ deg, dist: 120, type: "rat", state: "chase" }));
    window.__dev.aggroSurround({ enabled: true });
    window.__dev.aggroSurround({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    const before = window.__dev.aggroSurround({ driveSurround: { players, pts: bearPts([0, 90, 180, 270]), wipe: true } }).driveSurround;
    const snap = () => JSON.stringify({ aggroVariety: window.__dev.aggroVariety(), aggroDensity: window.__dev.aggroDensity(), aggroPile: window.__dev.aggroPile(), aggroContest: window.__dev.aggroContest(), targetSpread: window.__dev.targetSpread(), aggroFocus: window.__dev.aggroFocus() });
    const peersOn = snap();
    const avPrev = window.__dev.aggroVariety().enabled, adPrev = window.__dev.aggroDensity().enabled, apPrev = window.__dev.aggroPile().enabled, acPrev = window.__dev.aggroContest().enabled, tsPrev = window.__dev.targetSpread().enabled, afPrev = window.__dev.aggroFocus().enabled;
    window.__dev.aggroVariety({ enabled: !avPrev }); window.__dev.aggroDensity({ enabled: !adPrev }); window.__dev.aggroPile({ enabled: !apPrev }); window.__dev.aggroContest({ enabled: !acPrev }); window.__dev.targetSpread({ enabled: !tsPrev }); window.__dev.aggroFocus({ enabled: !afPrev });
    const after = window.__dev.aggroSurround({ surroundProbeLive: true }).surroundProbeLive;
    window.__dev.aggroVariety({ enabled: avPrev }); window.__dev.aggroDensity({ enabled: adPrev }); window.__dev.aggroPile({ enabled: apPrev }); window.__dev.aggroContest({ enabled: acPrev }); window.__dev.targetSpread({ enabled: tsPrev }); window.__dev.aggroFocus({ enabled: afPrev });
    const peersRestored = snap();
    window.__dev.aggroSurround({ clearSurround: true });
    window.__dev.aggroSurround({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.engaged === after.engaged;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeEngaged: before.engaged, afterEngaged: after.engaged };
  }, { Z, PLAYER_OFF });
  ok("14 ★ ORTOGONALIDAD aggroSurroundFind ⊥ peers: la señal de cerco (score/engaged) NO cambia al togglear AGGRO-VARIETY #127/AGGRO-DENSITY #126/AGGRO-PILE #124/AGGRO-CONTEST #123/TARGET-SPREAD #121/AGGRO-FOCUS #118; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION CENSUS: served config — 57 `_SURGE` totales, sole-false = AGGRO_SURROUND (56 true, incl. AGGRO_VARIETY #127 + AGGRO_MOMENTUM #128 LIVE).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const aggroVarietyLive = census.find(([n]) => n === "AGGRO_VARIETY_SURGE");
  const aggroMomentumLive = census.find(([n]) => n === "AGGRO_MOMENTUM_SURGE");
  const censusOK = total === 57 && trues === 56 && falses.length === 1 && falses[0] === "AGGRO_SURROUND_SURGE" && aggroVarietyLive && aggroVarietyLive[1] === "true" && aggroMomentumLive && aggroMomentumLive[1] === "true";
  ok("15 ★ 0-REGRESIÓN CENSUS: served config 57 `_SURGE` totales, 56 enabled:true (incl. AGGRO_VARIETY_SURGE #127 + AGGRO_MOMENTUM_SURGE #128 LIVE), sole-false = AGGRO_SURROUND_SURGE (DARK #129)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} aggroVariety=${aggroVarietyLive ? aggroVarietyLive[1] : "?"} aggroMomentum=${aggroMomentumLive ? aggroMomentumLive[1] : "?"}`);

  // 16 render badge "Rodeo:" drawn ON+surrounded / not OFF + fps. 🔑 label ÚNICO "Rodeo:" (NO "Cerco:" — colisiona con #113 ENCIRCLE LIVE que ya dibuja "Cerco:" cada frame).
  const badge = await page.evaluate(async (args) => {
    const { Z, PLAYER_OFF } = args;
    const bearPts = (bearings) => bearings.map((deg) => ({ deg, dist: 120, type: "rat", state: "chase" }));
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    const drive = () => window.__dev.aggroSurround({ driveSurround: { players, pts: bearPts([0, 90, 180, 270]), wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Rodeo:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.aggroSurround({ enabled: true });
    window.__dev.aggroSurround({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.aggroSurround({ clearSurround: true });
    window.__dev.aggroSurround({ enabled: false });
    const enAtOff = window.__dev.aggroSurround().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, PLAYER_OFF });
  ok("16 render badge \"Rodeo:\" se DIBUJA ON+cercado (S>0, re-driven cada frame) y NO OFF (S 0) + fps sano (label ÚNICO ⊥ #113 ENCIRCLE 'Cerco:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, PLAYER_OFF } = args; const bearPts = (bearings) => bearings.map((deg) => ({ deg, dist: 120, type: "rat", state: "chase" })); const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy })); window.__dev.aggroSurround({ enabled: true }); window.__dev.aggroSurround({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.aggroSurround({ driveSurround: { players, pts: bearPts([0, 90, 180, 270]), wipe: true } }); }, { Z, PLAYER_OFF });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.aggroSurround({ clearSurround: true }); window.__dev.aggroSurround({ enabled: false }); });

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
    const bearPts = (bearings) => bearings.map((deg) => ({ deg, dist: 120, type: "rat", state: "chase" }));
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2, 4 a 90° ⇒ S=1 ⇒ score2
    window.__dev.aggroSurround({ enabled: true });
    window.__dev.aggroSurround({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.aggroSurround({ driveSurround: { players, pts: bearPts([0, 90, 180, 270]), wipe: true } }).driveSurround;
    const vm = window.__dev.aggroSurround();
    const lut = [[[0, 8, -8, 4], 2], [[0, 90, 180, 270], 2], [[0, 60, 120, 180], 2], [[0, 72, 144, 216, 288], 2]].map(([bearings, P]) => { const m = window.__dev.aggroSurround({ surroundProbe: { bearings, players: P } }).surroundProbe; return { n: m.total, S: m.surround, sx: m.sx, sy: m.sy, tier: m.tier, charge: m.charge }; });
    const live = window.__dev.aggroSurround({ surroundProbeLive: true }).surroundProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.aggroSurround({ clearSurround: true });
    window.__dev.aggroSurround({ enabled: false });
    return { score: dv.score, idx: dv.idx, engaged: dv.engaged, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveEngaged: live.engaged, players: live.players, lut, fp };
  }, { Z, FPARG, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.engaged === B.engaged && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveEngaged === B.liveEngaged && A.players === B.players && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("17 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMA party+mobs a 90° (P2, N4, S=1 cercado)+héroe ⇒ score/idx/engaged/tier/charge + surroundProbeLive(field,engaged,players,score) + surroundProbe LUT (S/sx/sy enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},engaged:${A.engaged},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveEngaged:${A.liveEngaged},players:${A.players},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},engaged:${B.engaged},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveEngaged:${B.liveEngaged},players:${B.players},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.aggroSurround({ enabled: false }));
  await pageB.evaluate(() => window.__dev.aggroSurround({ enabled: false }));

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
