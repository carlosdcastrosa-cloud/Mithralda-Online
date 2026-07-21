// CAS-2820 — self-verify for PIÑA (DARK, CO_COHESION_SURGE.enabled:false). EVO mecánica #142 (base master b8c741a tras #141 REPLIEGUE CO_FLEE LIVE&served 83032b54f4e8/815) — EJE FRESCO + CANAL FRESCO, ⊥ a los 83 LIVE #59-#141. El 24º eje de COMPOSICIÓN-DE-INTENCIÓN y la SÉPTIMA faceta de la sub-familia PLAYER-COORDINATION (#136 CÓNCLAVE=ENGANCHADOS, #137 COHORTE=PRESENTES, #138 CUADRILLA=REMATAN, #139 SOCORRO=SOSTIENEN, #140 MURALLA=ABSORBEN, #141 REPLIEGUE=SE ALEJAN); ABRE la sub-dimensión GEOMETRÍA (las 6 priores son CONTEOS-DE-ACCIÓN; PIÑA mide la COHESIÓN ESPACIAL).
// (A) EJE FRESCO = PIÑA/CO-COHESION = C = nº de JUGADORES DISTINTOS VIVOS DENTRO de un radio de cohesión APRETADO (132px, INTENCIONALMENTE < los 300px de presencia de #137 COHORTE) alrededor del héroe (formation-cohesion/rally-tightness — cuán hombro-con-hombro está el roster), ⊥ #137 COHORTE (present-in-radius GRANDE, EL VECINO MÁS CERCANO) y ⊥ #141 REPLIEGUE (disengage ACCIÓN) y ⊥ #140 MURALLA (ABSORBEN) y ⊥ #139 SOCORRO (SOSTIENEN) y ⊥ #138 CUADRILLA (REMATAN) y ⊥ #136 CÓNCLAVE (ENGANCHADOS) y ⊥ #132 PARTY_VITAL (fracción-de-HP MEDIA = ESTADO). CONTEO CRUDO de apiñados, NO fracción (#123 cov/P), NO distancia-media float. SNAPSHOT PURO (lee las posiciones ya replicadas, SIN buffer temporal). 🔑 DETERMINISMO (sev-1): C=cuenta ENTERA de apiñados (dx²+dy²≤R² ENTERA, CERO division nueva, CERO centroide float) vs umbrales ENTEROS {midCohesion2,hiCohesion3} ⇒ 0-float en el score/decisión. Bandas sobre C: ≥hiCohesion(3) ⇒ piña-apretada ⇒ 2; ≥midCohesion(2) ⇒ piña-parcial ⇒ 1; <2 (solitario/dispersa) ⇒ 0. 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ el héroe solo NO forma piña ⇒ C colapsa ⇒ 0 (colapso LIMPIO, IMPOSIBLE en solitario).
// (B) CANAL FRESCO = coCohesionFind (fichas de piña por rematar con la cohesión ACREDITADA — NINGUNO de los 83 flags lo usa). Moneda FRESCA (h.coCohesionBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — PIÑA = GEOMETRÍA/COHESIÓN-ESPACIAL (cuán APRETADO) ⊥ TODOS los priores. PRIMARIO ⊥#137 COHORTE (present-in-radius, MISMO tipo pero radio GRANDE 300 vs APRETADO 132): MISMAS posiciones inyectadas a AMBOS ⇒ 3 jugadores a ~180px ⇒ COHORTE R3/w2 (dentro de 300) pero PIÑA C0/w0 (fuera de 132) — PRESENTE ⊥ APIÑADO, server-auth REAL. ⊥#141 REPLIEGUE: {3 apiñados/plantados,0 replegándose} PIÑA C3/w2 vs REPLIEGUE D0/w0; {0 apiñados,3 replegándose} PIÑA C0 vs REPLIEGUE D3/w2 (ESTADO-de-tightness ⊥ ACCIÓN-de-huir). ⊥#132 PARTY_VITAL: {full-HP,dispersa} TEMPLE W1.0/w2 pero PIÑA C0; {maltrecha,apiñada} TEMPLE W0.2/w0 pero PIÑA C3/w2 (ESTADO-de-HP ⊥ cohesión-ESPACIAL). ⊥#123 CONTEST: {2 de 2} vs {2 de 4} ⇒ MISMO C2/w1 (conteo CRUDO ⊥ fracción).
//
// Run: node tools/cas2820-cohesion-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2820");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// cohesionProbe LUT esperada: (clustered=nº apiñados en radio apretado, players=P gate)→C=clamp(clustered,0,P)→banda(C vs {midCohesion2,hiCohesion3,minPlayers2} ENTEROS)→{weight,rankTier}. UMBRALES hiCohesion 3 / midCohesion 2 + colapso single-player (C<minPlayers2 ⇒ 0).
const EXPECT_COH = [
  { name: "solo-P1",            clustered: 1, players: 1, C: 1, w: 0 },   // single-player: C1<midCohesion ⇒ 0 (colapso LIMPIO)
  { name: "duo-P2",             clustered: 2, players: 2, C: 2, w: 1 },   // 2 apiñados ⇒ C2 ⇒ 1
  { name: "duo-of-4",           clustered: 2, players: 4, C: 2, w: 1 },   // 🔑 2 apiñados DE un roster de 4 ⇒ C2 (conteo CRUDO, ⊥ CONTEST fracción 2/4)
  { name: "trio-P3",            clustered: 3, players: 3, C: 3, w: 2 },   // 3 apiñados ⇒ C3 ⇒ 2
  { name: "trio-of-4",          clustered: 3, players: 4, C: 3, w: 2 },   // C3 de P4 ⇒ 2
  { name: "full-P4",            clustered: 4, players: 4, C: 4, w: 2 },   // 4 apiñados ⇒ C4 ⇒ 2
  { name: "none-P3",            clustered: 0, players: 3, C: 0, w: 0 },   // 🔑 NADIE apiñado (todos dispersos) ⇒ C0 ⇒ 0
  { name: "one-clustered-P3",   clustered: 1, players: 3, C: 1, w: 0 },   // sólo 1 apiñado de un roster de 3 ⇒ C1 ⇒ 0
  { name: "clamp-overflow",     clustered: 9, players: 3, C: 3, w: 2 },   // clustered>P se clampa a P=3 ⇒ C3 ⇒ 2
];
// driveCluster REAL: inyecta roster sintético (P jugadores con offset {dx,dy}, opcional dead) ⇒ C server-auth = # jugadores VIVOS DENTRO del radio APRETADO (132px). NO predicate de acción (posicional puro).
// filas: [dx, dy, dead]
const EXPECT_DRIVE = [
  { name: "duo-tight",          players: [[0, 0, false], [44, 0, false]],                        C: 2, w: 1 },   // 2 apiñados en radio apretado ⇒ C2
  { name: "solo-tight",         players: [[0, 0, false]],                                        C: 1, w: 0 },   // 1 ⇒ C1 ⇒ 0
  { name: "trio-tight",         players: [[0, 0, false], [44, 0, false], [0, 44, false]],        C: 3, w: 2 },   // 3 ⇒ C3 ⇒ 2
  { name: "far-excluded",       players: [[0, 0, false], [44, 0, false], [180, 0, false]],       C: 2, w: 1 },   // 🔑 3º a 180px (fuera de 132 pero DENTRO de 300 COHORTE) ⇒ EXCLUIDO de PIÑA ⇒ C2 (radio APRETADO)
  { name: "dead-excluded",      players: [[0, 0, false], [44, 0, false], [30, 30, true]],        C: 2, w: 1 },   // 🔑 3º MUERTO ⇒ EXCLUIDO ⇒ C2 (ANTI-conteo-de-cadáveres)
  { name: "edge-just-in",       players: [[0, 0, false], [44, 0, false], [130, 0, false]],       C: 3, w: 2 },   // 130<132 ⇒ DENTRO ⇒ C3 (borde apretado)
];
// disperse/cluster: MISMAS posiciones para el crux REAL ⊥ COHORTE. ~180px ⇒ dentro de 300 (COHORTE) pero fuera de 132 (PIÑA).
const DISPERSE = [[180, 0], [0, 180], [130, 130]];   // dists ≈180,180,184 — todas en (132,300)
const CLUSTER  = [[0, 0], [40, 0], [0, 40]];         // dists 0,40,40 — todas <132

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coCohesion && window.__dev.coFlee && window.__dev.coTank && window.__dev.coSupport && window.__dev.coKill && window.__dev.coPresence && window.__dev.coStrike && window.__dev.partyVital && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coCohesion + peer hooks (coFlee/coTank/coSupport/coKill/coPresence/coStrike/partyVital) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.coCohesion());
  ok("2 byte-id OFF (fresh boot): CO_COHESION_SURGE.enabled false AND G.coCohesionBounty NUNCA se crea (gExists false) AND G._coCohesionParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.cohesion === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coCohesionFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} cohesion=${dark.cohesion} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiCohesion=${dark.hiCohesion} midCohesion=${dark.midCohesion} minPlayers=${dark.minPlayers} radius=${dark.radius} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no coCohesionFind/coCohesionBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coCohesionFind|coCohesionBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coCohesionBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'coCohesionFind'/'coCohesionBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coCohesion({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coCohesion({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ cohesionProbe LUT: (clustered,players)→C=clamp→banda(C vs {2,3} ENTEROS)→tier→charge.
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coCohesion({ cohesionProbe: { clustered: c.clustered, players: c.players } }).cohesionProbe), EXPECT_COH);
  const tabOK = EXPECT_COH.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].cohesion === c.C);
  ok("5 ★ cohesionProbe LUT (PIÑA C=#apiñados hombro-con-hombro): solo-P1(C1)⇒0, duo(C2)⇒1, duo-of-4(C2)⇒1, trio(C3)⇒2, trio-of-4(C3)⇒2, full(C4)⇒2, none-P3(C0)⇒0, one-clustered-P3(C1)⇒0, clamp-overflow⇒C3. UMBRAL hiCohesion 3/midCohesion 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_COH[i].name, p: x.players, C: x.cohesion, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH PIÑA: driveCluster inyecta roster sintético (posiciones + vivo/muerto) ⇒ C REAL server-auth = #jugadores VIVOS DENTRO del radio APRETADO (132px, filtra dispersos + muertos).
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z } = args;
    const mkParty = (rows) => rows.map((r) => ({ dx: r[0], dy: r[1], dead: !!r[2] }));
    window.__dev.coCohesion({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coCohesion({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coCohesion({ driveCluster: { players: mkParty(c.players), wipe: true } }).driveCluster;
      const live = window.__dev.coCohesion({ cohesionProbeLive: true }).cohesionProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvCohesion: dv.cohesion, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveCohesion: live.cohesion, livePlayers: live.players });
    }
    window.__dev.coCohesion({ clearCluster: true });
    window.__dev.coCohesion({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvCohesion === c.C && comp[i].liveCohesion === c.C);
  ok("5c ★ REAL SERVER-AUTH PIÑA (posición snapshot, radio APRETADO 132px): duo-tight(C2)=w1, solo(C1)=w0, trio(C3)=w2, far-excluded(180px⇒C2)=w1, dead-excluded(C2)=w1, edge-just-in(130px⇒C3)=w2 (filtra radio APRETADO + muertos)",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#137 COHORTE (COHESIÓN/radio-APRETADO ⊥ PRESENCIA/radio-GRANDE) — REAL server-auth: MISMAS posiciones a AMBOS.
  const cruxPres = await page.evaluate((args) => {
    const { Z, DISPERSE, CLUSTER } = args;
    const run = (rows) => {
      window.__dev.coCohesion({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.coPresence({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.coCohesion({ driveCluster: { players: rows.map(r => ({ dx: r[0], dy: r[1] })), wipe: true } });
      window.__dev.coPresence({ driveRoster: { players: rows.map(r => ({ dx: r[0], dy: r[1] })), wipe: true } });
      const coh = window.__dev.coCohesion({ cohesionProbeLive: true }).cohesionProbeLive;
      const pres = window.__dev.coPresence({ rosterProbeLive: true }).rosterProbeLive;
      return { cohesion: coh.cohesion, cohScore: coh.score, rally: pres.rally, presScore: pres.score };
    };
    window.__dev.coCohesion({ enabled: true }); window.__dev.coPresence({ enabled: true });
    const disp = run(DISPERSE);   // 3 a ~180px: dentro de 300 (COHORTE) pero fuera de 132 (PIÑA)
    const clus = run(CLUSTER);    // 3 a <132px: dentro de AMBOS
    window.__dev.coCohesion({ clearCluster: true }); window.__dev.coPresence({ clearRoster: true });
    window.__dev.coCohesion({ enabled: false }); window.__dev.coPresence({ enabled: false });
    return { disp, clus };
  }, { Z, DISPERSE, CLUSTER });
  const cruxPresOK =
    cruxPres.disp.rally === 3 && cruxPres.disp.presScore === 2 && cruxPres.disp.cohesion === 0 && cruxPres.disp.cohScore === 0
    && cruxPres.clus.rally === 3 && cruxPres.clus.presScore === 2 && cruxPres.clus.cohesion === 3 && cruxPres.clus.cohScore === 2;
  ok("6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#137 COHORTE (COHESIÓN ⊥ PRESENCIA, radios REALES 132 vs 300): 3 jugadores a ~180px ⇒ COHORTE R3/w2 (dentro de 300) pero PIÑA C0/w0 (fuera de 132) — PRESENTE ⊥ APIÑADO; los MISMOS 3 a <132px ⇒ COHORTE R3/w2 y PIÑA C3/w2 (server-auth REAL, divergen sólo por el radio)",
     cruxPresOK, JSON.stringify(cruxPres));

  // 6b ★ CRUX ⊥#141 REPLIEGUE (tightness ESTADO ⊥ disengage ACCIÓN): PIÑA cuenta APIÑADOS (posición), REPLIEGUE cuenta KITERS (velocidad-away).
  const cruxFlee = await page.evaluate(() => {
    const coh = (clustered, P) => window.__dev.coCohesion({ cohesionProbe: { clustered, players: P } }).cohesionProbe;
    const flee = (breaking, P) => window.__dev.coFlee({ fleeProbe: { breaking, players: P } }).fleeProbe;
    // {3 apiñados/plantados, 0 replegándose}: PIÑA C3/w2 pero REPLIEGUE D0/w0 (juntos pero quietos)
    const A = { coh: coh(3, 3), flee: flee(0, 3) };
    // {0 apiñados (dispersos), 3 replegándose}: PIÑA C0/w0 pero REPLIEGUE D3/w2 (huyen dispersos)
    const B = { coh: coh(0, 3), flee: flee(3, 3) };
    return { A, B };
  });
  const cruxFleeOK =
    cruxFlee.A.coh.cohesion === 3 && cruxFlee.A.coh.weight === 2 && cruxFlee.A.flee.flee === 0 && cruxFlee.A.flee.weight === 0
    && cruxFlee.B.coh.cohesion === 0 && cruxFlee.B.coh.weight === 0 && cruxFlee.B.flee.flee === 3 && cruxFlee.B.flee.weight === 2;
  ok("6b ★ CRUX ⊥#141 REPLIEGUE (ESTADO-de-tightness ⊥ ACCIÓN-de-huir): {3 apiñados/plantados,0 replegándose} ⇒ PIÑA C3/w2 pero REPLIEGUE D0/w0; {0 apiñados/dispersos,3 replegándose} ⇒ PIÑA C0/w0 pero REPLIEGUE D3/w2 ⇒ posición-tightness ⊥ velocidad-away (pesos divergen en AMBOS sentidos)",
     cruxFleeOK, JSON.stringify(cruxFlee));

  // 6c ★ CRUX ⊥#140 MURALLA (GEOMETRÍA ⊥ ACCIÓN-de-absorber): apiñarse ⊥ comer un golpe.
  const cruxTank = await page.evaluate(() => {
    const coh = (clustered, P) => window.__dev.coCohesion({ cohesionProbe: { clustered, players: P } }).cohesionProbe;
    const brunt = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    // {3 apiñados, 0 absorbiendo}: PIÑA C3/w2 pero MURALLA T0/w0
    const A = { coh: coh(3, 3), brunt: brunt(0, 3) };
    // {0 apiñados/dispersos, 3 absorbiendo}: PIÑA C0/w0 pero MURALLA T3/w2
    const B = { coh: coh(0, 3), brunt: brunt(3, 3) };
    return { A, B };
  });
  const cruxTankOK =
    cruxTank.A.coh.cohesion === 3 && cruxTank.A.coh.weight === 2 && cruxTank.A.brunt.tank === 0 && cruxTank.A.brunt.weight === 0
    && cruxTank.B.coh.cohesion === 0 && cruxTank.B.coh.weight === 0 && cruxTank.B.brunt.tank === 3 && cruxTank.B.brunt.weight === 2;
  ok("6c ★ CRUX ⊥#140 MURALLA (GEOMETRÍA ⊥ ACCIÓN-de-absorber): {3 apiñados,0 absorbiendo} ⇒ PIÑA C3/w2 pero MURALLA T0/w0; {0 apiñados,3 absorbiendo} ⇒ PIÑA C0/w0 pero MURALLA T3/w2 ⇒ la geometría del roster ⊥ qué ACCIÓN ejecuta cada quién",
     cruxTankOK, JSON.stringify(cruxTank));

  // 6d ★ CRUX ⊥#132 PARTY_VITAL (COHESIÓN-ESPACIAL ⊥ ESTADO-de-HP): PIÑA = conteo de apiñados; TEMPLE = FRACCIÓN-de-HP MEDIA.
  const cruxVital = await page.evaluate(() => {
    const coh = (clustered, P) => window.__dev.coCohesion({ cohesionProbe: { clustered, players: P } }).cohesionProbe;
    const vital = (fracs, mobs) => window.__dev.partyVital({ vitalProbe: { fracs, mobs, hpMax: 1000 } }).vitalProbe;
    // {party full-HP, dispersa (0 apiñados)}: TEMPLE W1.0/w2 (sana) pero PIÑA C0/w0 (dispersos)
    const A = { coh: coh(0, 3), vital: vital([1, 1, 1], 3) };
    // {party maltrecha 20%, apiñada (3)}: TEMPLE W0.2/w0 (moribunda) pero PIÑA C3/w2 (apiñados)
    const B = { coh: coh(3, 3), vital: vital([0.2, 0.2, 0.2], 3) };
    return { A, B };
  });
  const cruxVitalOK =
    cruxVital.A.vital.weight === 2 && cruxVital.A.vital.vital >= 0.99 && cruxVital.A.coh.cohesion === 0 && cruxVital.A.coh.weight === 0
    && cruxVital.B.vital.weight === 0 && cruxVital.B.vital.vital <= 0.3 && cruxVital.B.coh.cohesion === 3 && cruxVital.B.coh.weight === 2;
  ok("6d ★ CRUX ⊥#132 PARTY_VITAL (COHESIÓN-ESPACIAL ⊥ ESTADO-de-HP): {party full-HP,dispersa} ⇒ TEMPLE W1.0/w2 pero PIÑA C0/w0; {party 20%HP,apiñada} ⇒ TEMPLE W0.2/w0 pero PIÑA C3/w2 ⇒ ESTADO-de-HP (float MEDIO) ⊥ tightness-ESPACIAL (entero), diverge en AMBOS sentidos",
     cruxVitalOK, JSON.stringify(cruxVital));

  // 6e ★ CRUX ⊥#123 CONTEST (CONTEO CRUDO ⊥ FRACCIÓN cov/P): mismo C con distinta cobertura.
  const cruxContest = await page.evaluate(() => {
    const coh = (clustered, P) => window.__dev.coCohesion({ cohesionProbe: { clustered, players: P } }).cohesionProbe;
    const full = coh(2, 2);   // 2 de 2: C2, cobertura 1.0
    const half = coh(2, 4);   // 2 de 4: MISMO C2, pero cobertura 0.5
    return { full, half };
  });
  const cruxContestOK = cruxContest.full.cohesion === 2 && cruxContest.half.cohesion === 2 && cruxContest.full.weight === 1 && cruxContest.half.weight === 1;
  ok("6e ★ CRUX ⊥#123 CONTEST (CONTEO ⊥ FRACCIÓN): {2 de 2}(cov 1.0) vs {2 de 4}(cov 0.5) ⇒ MISMO PIÑA C2/w1 (conteo CRUDO de apiñados, INVARIANTE a la cobertura fraccional)",
     cruxContestOK, JSON.stringify(cruxContest));

  // 7 ★ C-SENSITIVITY: más apiñados DENTRO del radio apretado ⇒ C sube.
  const cSens = await page.evaluate(() => {
    const t = (clustered, P) => { const m = window.__dev.coCohesion({ cohesionProbe: { clustered, players: P } }).cohesionProbe; return { C: m.cohesion, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), full: t(4, 4) };
  });
  const cSensOK = cSens.duo.C === 2 && cSens.trio.C === 3 && cSens.full.C === 4 && cSens.duo.w === 1 && cSens.trio.w === 2 && cSens.full.w === 2;
  ok("7 ★ C-SENSITIVITY (C sube con más apiñados): 2⇒C2/w1, 3⇒C3/w2, 4⇒C4/w2 (PIÑA mide el tamaño CRUDO de la formación apretada)",
     cSensOK, JSON.stringify(cSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR (driveCluster REAL): SIN piña (C=1) ⇒ 0; CON piña (C≥2) ⇒ >0.
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coCohesion({ enabled: true });
    const drive = (rows) => { window.__dev.coCohesion({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coCohesion({ driveCluster: { players: rows.map(r => ({ dx: r[0], dy: r[1] })), wipe: true } }).driveCluster;
      const live = window.__dev.coCohesion({ cohesionProbeLive: true }).cohesionProbeLive;
      return { idx: dv.idx, cohesion: dv.cohesion, score: dv.score, players: live.players }; };
    const sp = drive([[0, 0]]);                        // single apiñado: C=1 ⇒ 0 (colapso)
    const mp = drive([[0, 0], [44, 0], [0, 44]]);      // piña C3 ⇒ score2 (bien-definido)
    window.__dev.coCohesion({ clearCluster: true });
    window.__dev.coCohesion({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.cohesion === 1 && degen.sp.score === 0 && degen.mp.cohesion === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 apiñado ⇒ C1/score0; 3 apiñados ⇒ C3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE formar piña en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM: dos cohesionProbe idénticos ⇒ C/w byte-idénticos (conteo ENTERO + banda de umbrales enteros {2,3}, 0-float en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.coCohesion({ cohesionProbe: { clustered: 3, players: 4 } }).cohesionProbe;
    const b = window.__dev.coCohesion({ cohesionProbe: { clustered: 3, players: 4 } }).cohesionProbe;
    return { a: { C: a.cohesion, w: a.weight }, b: { C: b.cohesion, w: b.weight } };
  });
  const detOK = det.a.C === det.b.C && det.a.w === det.b.w && det.a.C === 3;
  ok("9 ★ INTEGER-DETERMINISM: cohesionProbe repetido ⇒ C/weight byte-idénticos (CONTEO ENTERO de apiñados + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 10 CANAL coCohesionFind: forageChargePreview con cohesión acreditada >0 ; solitario → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coCohesion({ enabled: true });
    window.__dev.coCohesion({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coCohesion({ driveCluster: { players: [{ dx: 0, dy: 0 }, { dx: 44, dy: 0 }, { dx: 0, dy: 44 }], wipe: true } });   // piña-apretada ⇒ score2
    const actVm = window.__dev.coCohesion();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coCohesion({ driveCluster: { players: [{ dx: 0, dy: 0 }], wipe: true } });   // solitario (C1) ⇒ score0
    const goVm = window.__dev.coCohesion();
    window.__dev.coCohesion({ clearCluster: true });
    window.__dev.coCohesion({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coCohesionFind: forageChargePreview piña plena (C≥3) ⇒ charge>0 (==coCohesionBonus); con solitario (C1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds coCohesionBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 3; s <= 10; s++) vals.push(window.__dev.coCohesion({ cohesionProbe: { clustered: s, players: s } }).cohesionProbe.charge);  // C=s ⇒ w2
    return { max: Math.max(...vals), cap: window.__dev.coCohesion().cap };
  });
  ok("11 ★ SUB-CAP: ninguna piña plena produce charge>coCohesionBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full piña available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coCohesion({ enabled: true });
    window.__dev.coCohesion({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coCohesion({ driveCluster: { players: [{ dx: 0, dy: 0 }, { dx: 44, dy: 0 }, { dx: 0, dy: 44 }], wipe: true } });   // piña-apretada disponible
    window.__dev.coCohesion({ enabled: false });                          // now OFF
    const off = window.__dev.coCohesion();
    window.__dev.coCohesion({ enabled: true }); window.__dev.coCohesion({ clearCluster: true }); window.__dev.coCohesion({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, cohesion: off.cohesion };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.cohesion === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, coCohesionBonus(piña plena disponible)==0 + forageChargePreview==0 + idx==0 + cohesion==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling coTank/coSupport/coKill/coPresence/coFlee/partyVital no cambia la señal de coCohesion.
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coCohesion({ enabled: true });
    window.__dev.coCohesion({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coCohesion({ driveCluster: { players: [{ dx: 0, dy: 0 }, { dx: 44, dy: 0 }, { dx: 0, dy: 44 }], wipe: true } }).driveCluster;
    const snap = () => JSON.stringify({ coTank: window.__dev.coTank(), coSupport: window.__dev.coSupport(), coKill: window.__dev.coKill(), coPresence: window.__dev.coPresence(), coFlee: window.__dev.coFlee(), partyVital: window.__dev.partyVital() });
    const peersOn = snap();
    const ctPrev = window.__dev.coTank().enabled, csPrev = window.__dev.coSupport().enabled, ckPrev = window.__dev.coKill().enabled, cpPrev = window.__dev.coPresence().enabled, cfPrev = window.__dev.coFlee().enabled, pvPrev = window.__dev.partyVital().enabled;
    window.__dev.coTank({ enabled: !ctPrev }); window.__dev.coSupport({ enabled: !csPrev }); window.__dev.coKill({ enabled: !ckPrev }); window.__dev.coPresence({ enabled: !cpPrev }); window.__dev.coFlee({ enabled: !cfPrev }); window.__dev.partyVital({ enabled: !pvPrev });
    const after = window.__dev.coCohesion({ cohesionProbeLive: true }).cohesionProbeLive;
    window.__dev.coTank({ enabled: ctPrev }); window.__dev.coSupport({ enabled: csPrev }); window.__dev.coKill({ enabled: ckPrev }); window.__dev.coPresence({ enabled: cpPrev }); window.__dev.coFlee({ enabled: cfPrev }); window.__dev.partyVital({ enabled: pvPrev });
    const peersRestored = snap();
    window.__dev.coCohesion({ clearCluster: true });
    window.__dev.coCohesion({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.cohesion === after.cohesion;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeCohesion: before.cohesion, afterCohesion: after.cohesion };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD coCohesionFind ⊥ peers: la señal de co-cohesion (score/cohesion) NO cambia al togglear CO-TANK #140/CO-SUPPORT #139/CO-KILL #138/CO-PRESENCE #137/CO-FLEE #141/PARTY-VITAL #132; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION CENSUS: served config — 70 `_SURGE` totales, sole-false = CO_COHESION (69 true, incl. CO_FLEE #141 LIVE).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coFleeLive = census.find(([n]) => n === "CO_FLEE_SURGE");
  const censusOK = total === 70 && trues === 69 && falses.length === 1 && falses[0] === "CO_COHESION_SURGE" && coFleeLive && coFleeLive[1] === "true";
  ok("14 ★ 0-REGRESIÓN CENSUS: served config 70 `_SURGE` totales, 69 enabled:true (incl. CO_FLEE_SURGE #141 LIVE), sole-false = CO_COHESION_SURGE (DARK #142)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coFlee=${coFleeLive ? coFleeLive[1] : "?"}`);

  // 15 render badge "Piña:" drawn ON+piña / not OFF + fps. 🔑 label ÚNICO "Piña:" (⊥ #141 'Repliegue:'/#140 'Muralla:'/#139 'Socorro:'/#138 'Cuadrilla:'/#137 'Cohorte:'/#136 'Cónclave:'/#108 'Falange:').
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const drive = () => window.__dev.coCohesion({ driveCluster: { players: [{ dx: 0, dy: 0 }, { dx: 44, dy: 0 }, { dx: 0, dy: 44 }], wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Piña:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coCohesion({ enabled: true });
    window.__dev.coCohesion({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coCohesion({ clearCluster: true });
    window.__dev.coCohesion({ enabled: false });
    const enAtOff = window.__dev.coCohesion().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z });
  ok("15 render badge \"Piña:\" se DIBUJA ON+piña (C>0, re-driven cada frame) y NO OFF (C 0) + fps sano (label ÚNICO ⊥ #141 'Repliegue:'/#140 'Muralla:'/#139 'Socorro:'/#138 'Cuadrilla:'/#137 'Cohorte:'/#136 'Cónclave:'/#108 'Falange:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.coCohesion({ enabled: true }); window.__dev.coCohesion({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coCohesion({ driveCluster: { players: [{ dx: 0, dy: 0 }, { dx: 44, dy: 0 }, { dx: 0, dy: 44 }], wipe: true } }); }, { Z });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coCohesion({ clearCluster: true }); window.__dev.coCohesion({ enabled: false }); });

  // 16 ★ NORTH STAR — 2-client convergence (MANDATORY sev-1).
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
    const { Z, FPARG } = args;
    window.__dev.coCohesion({ enabled: true });
    window.__dev.coCohesion({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coCohesion({ driveCluster: { players: [{ dx: 0, dy: 0 }, { dx: 44, dy: 0 }, { dx: 0, dy: 44 }], wipe: true } }).driveCluster;   // C=3 ⇒ score2
    const vm = window.__dev.coCohesion();
    const lut = [[2, 2], [3, 3], [1, 1], [4, 4]].map(([clustered, P]) => { const m = window.__dev.coCohesion({ cohesionProbe: { clustered, players: P } }).cohesionProbe; return { p: m.players, C: m.cohesion, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coCohesion({ cohesionProbeLive: true }).cohesionProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coCohesion({ clearCluster: true });
    window.__dev.coCohesion({ enabled: false });
    return { score: dv.score, idx: dv.idx, cohesion: dv.cohesion, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveCohesion: live.cohesion, livePlayers: live.players, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.cohesion === B.cohesion && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveCohesion === B.liveCohesion && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMA piña C=3 ⇒ score/idx/cohesion/players/tier/charge + cohesionProbeLive(field,cohesion,players,score) + cohesionProbe LUT (C enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},cohesion:${A.cohesion},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveCohesion:${A.liveCohesion},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},cohesion:${B.cohesion},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveCohesion:${B.liveCohesion},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.coCohesion({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coCohesion({ enabled: false }));

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
