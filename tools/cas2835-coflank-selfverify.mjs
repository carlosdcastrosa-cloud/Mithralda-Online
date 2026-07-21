// CAS-2835 — self-verify for TENAZA (DARK, CO_FLANK_SURGE.enabled:false). EVO mecánica #145 (base master 8f7961c tras #144 DIANA CO_FOCUS LIVE&served a210d646fa96/815, census 72) — EJE FRESCO + CANAL FRESCO, ⊥ a los 86 LIVE #59-#144. El 27º eje de COMPOSICIÓN-DE-INTENCIÓN y la DÉCIMA faceta de la sub-familia PLAYER-COORDINATION (#136 CÓNCLAVE=ENGANCHADOS, #137 COHORTE=PRESENTES, #138 CUADRILLA=REMATAN, #139 SOCORRO=SOSTIENEN, #140 MURALLA=ABSORBEN, #141 REPLIEGUE=SE ALEJAN, #142 PIÑA=APIÑADOS, #143 ENVITE=EMPUJAN, #144 DIANA=CONVERGEN-el-aim/CONTEO); es la sub-faceta GEOMETRÍA de la convergencia que abrió #144.
// (A) EJE FRESCO = TENAZA/CO-FLANK = F = MÁX sobre los mobs de (nº de SECTORES angulares DISTINTOS ocupados por los jugadores VIVOS que apuntan a ese mob, dentro del radio de engagement mob-céntrico (300px)) = el mayor grado de envolvimiento/pinza sobre UN objetivo (pincer/surround), ⊥ #144 DIANA (CONTEO de convergentes — GEOMETRÍA ⊥ CONTEO), ⊥ #108 FLANK_SURGE (concentración angular float de MOBS — player-side ⊥ mob-side, entero ⊥ float), ⊥ #142 PIÑA (player↔player tightness), ⊥ #112 CONVERGE (velocidad RADIAL de MOBS). Sector por SIGNO ENTERO puro `(sign(dx)+1)*3+(sign(dy)+1)` ∈{0..8}; F = popcount de la máscara OR de sectores ocupados. 🔑 DETERMINISMO (sev-1): F = popcount de máscara por SIGNO ENTERO (CERO atan2/ángulo/normalización float; el OR de máscaras es CONMUTATIVO ⇒ orden-independiente) vs umbrales ENTEROS {midFlank2,hiFlank3} ⇒ 0-float en el score/decisión. Bandas: F≥hiFlank(3) ⇒ envolvimiento-pleno ⇒ 2; F≥midFlank(2) ⇒ pinza-parcial ⇒ 1; <2 (un-flanco/solitario) ⇒ 0. 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ ≤1 sector ⇒ F colapsa ⇒ 0 (colapso LIMPIO).
// (B) CANAL FRESCO = coFlankFind (fichas de tenaza por rematar con el envolvimiento ACREDITADO — NINGUNO de los 86 flags lo usa). Moneda FRESCA (h.coFlankBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — TENAZA = GEOMETRÍA-DE-ENVOLVIMIENTO (arreglo angular player↔target) ⊥ TODOS los priores. PRIMARIO ⊥#144 DIANA (CONTEO ⊥ GEOMETRÍA): F≤G SIEMPRE por construcción (sectores≤count), pero G ALTO NO implica F alto — 3 amontonados en UN flanco ⇒ DIANA G3/w2 pero TENAZA F1/w0; 3 rodeando desde 3 sectores ⇒ DIANA G3/w2 (IDÉNTICO) pero TENAZA F3/w2 — DIANA es CIEGA a la geometría que TENAZA resuelve. ⊥#108 FLANK_SURGE (canal coFlankFind ⊥ flankFind, sectores-ENTEROS-de-JUGADORES ⊥ resultant-length-float-de-MOBS). ⊥#142 PIÑA: {3 apiñados/un-flanco} PIÑA C3/w2 vs TENAZA F1/w0; {dispersos/rodeando} PIÑA C0/w0 vs TENAZA F3/w2.
//
// Run: node tools/cas2835-coflank-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2835");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// flankProbe LUT esperada: (sectors=nº de sectores distintos sobre el mob más rodeado, players=P gate)→F=clamp(sectors,0,min(players,9))→banda(F vs {midFlank2,hiFlank3,minPlayers2} ENTEROS)→{weight,rankTier}. UMBRALES hiFlank 3 / midFlank 2 + colapso single-player (F<minPlayers2 ⇒ 0).
const EXPECT_FLK = [
  { name: "solo-P1",            sectors: 1, players: 1, F: 1, w: 0 },   // single-player: F1<midFlank ⇒ 0 (colapso LIMPIO)
  { name: "duo-P2",             sectors: 2, players: 2, F: 2, w: 1 },   // 2 sectores ⇒ F2 ⇒ 1 (pinza parcial)
  { name: "duo-of-4",           sectors: 2, players: 4, F: 2, w: 1 },   // 2 sectores DE un roster de 4 ⇒ F2 ⇒ 1
  { name: "trio-P3",            sectors: 3, players: 3, F: 3, w: 2 },   // 3 sectores ⇒ F3 ⇒ 2 (envolvimiento pleno)
  { name: "surround-4",         sectors: 4, players: 4, F: 4, w: 2 },   // 4 sectores ⇒ F4 ⇒ 2
  { name: "none",               sectors: 0, players: 3, F: 0, w: 0 },   // 🔑 0 sectores (nadie apunta) ⇒ F0 ⇒ 0
  { name: "bunched-P4",         sectors: 1, players: 4, F: 1, w: 0 },   // 🔑 4 jugadores TODOS en UN sector (un flanco) ⇒ F1 ⇒ 0 (convergen pero NO rodean)
  { name: "clamp-players",      sectors: 9, players: 3, F: 3, w: 2 },   // sectors>P se clampa a P=3 ⇒ F3 ⇒ 2
  { name: "clamp-sectors",      sectors: 12, players: 12, F: 9, w: 2 }, // sectors>9 (rejilla 3×3) se clampa a 9 ⇒ F9 ⇒ 2
];
// driveFlank REAL: inyecta roster sintético (P jugadores con offset MOB-céntrico {dx,dy}+targetId, opcional dead) ⇒ F server-auth = MÁX popcount de la máscara de sectores por targetId entre jugadores VIVOS DENTRO del radio (300px) con objetivo activo.
// filas: [dx, dy, targetId, dead]. sector=(sign(dx)+1)*3+(sign(dy)+1): [+,0]=7 [-,0]=1 [0,+]=5 [0,-]=3 [+,+]=8 [+,-]=6 [-,+]=2 [-,-]=0
const EXPECT_DRIVE = [
  { name: "opposite-duo",       players: [[50, 0, 7, false], [-50, 0, 7, false]],                       F: 2, w: 1 },   // sectores {7,1} OPUESTOS ⇒ F2 (pinza)
  { name: "same-sector-duo",    players: [[50, 0, 7, false], [60, 0, 7, false]],                        F: 1, w: 0 },   // 🔑 2 en el MISMO sector 7 (un flanco) ⇒ F1 ⇒ 0 (DIANA G2 pero NO rodean)
  { name: "solo",               players: [[50, 0, 7, false]],                                           F: 1, w: 0 },   // 1 ⇒ F1 ⇒ 0
  { name: "trio-surround",      players: [[50, 0, 7, false], [-50, 0, 7, false], [0, 50, 7, false]],    F: 3, w: 2 },   // sectores {7,1,5} ⇒ F3 (rodeo)
  { name: "trio-same-sector",   players: [[50, 0, 7, false], [55, 0, 7, false], [60, 0, 7, false]],     F: 1, w: 0 },   // 🔑 3 amontonados en el sector 7 ⇒ F1 ⇒ 0 (DIANA G3 pero un flanco)
  { name: "notarget-excluded",  players: [[50, 0, 7, false], [-50, 0, 7, false], [0, 50, 0, false]],    F: 2, w: 1 },   // 🔑 3º sin objetivo (targetId 0) ⇒ EXCLUIDO ⇒ {7,1} F2
  { name: "dead-excluded",      players: [[50, 0, 7, false], [-50, 0, 7, false], [0, 50, 7, true]],     F: 2, w: 1 },   // 🔑 3º MUERTO ⇒ EXCLUIDO ⇒ F2 (ANTI-cadáveres)
  { name: "far-excluded",       players: [[50, 0, 7, false], [-50, 0, 7, false], [400, 0, 7, false]],   F: 2, w: 1 },   // 🔑 3º a 400px (fuera de 300, sector 7 duplicado igual) ⇒ EXCLUIDO ⇒ F2 (radio engagement)
  { name: "quad-surround",      players: [[50, 0, 7, false], [-50, 0, 7, false], [0, 50, 7, false], [0, -50, 7, false]], F: 4, w: 2 },   // sectores {7,1,5,3} 4 direcciones ⇒ F4
  { name: "max-of-groups",      players: [[50, 0, 7, false], [55, 0, 7, false], [40, 40, 9, false], [-40, 40, 9, false]], F: 2, w: 1 },   // 🔑 grupo 7={7} F1, grupo 9={8,2} F2 ⇒ MÁX F2 (toma el mob MÁS rodeado)
];

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coFlank && window.__dev.coFocus && window.__dev.coAdvance && window.__dev.coCohesion && window.__dev.coFlee && window.__dev.coTank && window.__dev.coSupport && window.__dev.coKill && window.__dev.coPresence && window.__dev.coStrike && window.__dev.partyVital && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coFlank + peer hooks (coFocus/coAdvance/coCohesion/coFlee/coTank/coSupport/coKill/coPresence/coStrike/partyVital) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.coFlank());
  ok("2 byte-id OFF (fresh boot): CO_FLANK_SURGE.enabled false AND G.coFlankBounty NUNCA se crea (gExists false) AND G._coFlankParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.flank === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coFlankFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} flank=${dark.flank} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiFlank=${dark.hiFlank} midFlank=${dark.midFlank} minPlayers=${dark.minPlayers} radius=${dark.radius} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no coFlankFind/coFlankBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coFlankFind|coFlankBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coFlankBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'coFlankFind'/'coFlankBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coFlank({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coFlank({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ flankProbe LUT: (sectors,players)→F=clamp→banda(F vs {2,3} ENTEROS)→tier→charge.
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coFlank({ flankProbe: { sectors: c.sectors, players: c.players } }).flankProbe), EXPECT_FLK);
  const tabOK = EXPECT_FLK.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].flank === c.F);
  ok("5 ★ flankProbe LUT (TENAZA F=# sectores distintos sobre el mob más rodeado): solo-P1(F1)⇒0, duo(F2)⇒1, duo-of-4(F2)⇒1, trio(F3)⇒2, surround-4(F4)⇒2, none(F0)⇒0, bunched-P4(F1)⇒0, clamp-players⇒F3, clamp-sectors⇒F9. UMBRAL hiFlank 3/midFlank 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_FLK[i].name, p: x.players, F: x.flank, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH TENAZA: driveFlank inyecta roster sintético (offset MOB-céntrico + targetId + vivo/muerto) ⇒ F REAL server-auth = MÁX popcount de la máscara de sectores por targetId entre jugadores VIVOS DENTRO del radio (300px) con objetivo activo (filtra sin-objetivo + muertos + fuera-de-radio).
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z } = args;
    const mkParty = (rows) => rows.map((r) => ({ dx: r[0], dy: r[1], targetId: r[2], dead: !!r[3] }));
    window.__dev.coFlank({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coFlank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coFlank({ driveFlank: { players: mkParty(c.players), wipe: true } }).driveFlank;
      const live = window.__dev.coFlank({ flankProbeLive: true }).flankProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvFlank: dv.flank, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveFlank: live.flank, livePlayers: live.players });
    }
    window.__dev.coFlank({ clearFlank: true });
    window.__dev.coFlank({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvFlank === c.F && comp[i].liveFlank === c.F);
  ok("5c ★ REAL SERVER-AUTH TENAZA (max-popcount de sectores por targetId, radio 300px): opposite-duo({7,1}⇒F2)=w1, same-sector-duo({7}⇒F1)=w0, solo(F1)=w0, trio-surround({7,1,5}⇒F3)=w2, trio-same-sector({7}⇒F1)=w0, notarget-excl(F2)=w1, dead-excl(F2)=w1, far-excl(F2)=w1, quad-surround({7,1,5,3}⇒F4)=w2, max-of-groups(g7=F1,g9=F2⇒F2)=w1 (filtra sin-objetivo + muertos + fuera-de-radio; toma el mob MÁS rodeado)",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#144 DIANA (CONTEO ⊥ GEOMETRÍA) — REAL server-auth: MISMO G (DIANA CIEGA) pero F distinto (TENAZA resuelve).
  const cruxFoc = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coFlank({ enabled: true }); window.__dev.coFocus({ enabled: true });
    const drive = (rows) => {
      window.__dev.coFlank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.coFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const p = rows.map(r => ({ dx: r[0], dy: r[1], targetId: r[2] }));
      window.__dev.coFlank({ driveFlank: { players: p, wipe: true } });
      window.__dev.coFocus({ driveFocus: { players: p, wipe: true } });
      return { flk: window.__dev.coFlank({ flankProbeLive: true }).flankProbeLive, foc: window.__dev.coFocus({ focusProbeLive: true }).focusProbeLive };
    };
    // BUNCHED: 3 amontonados en el MISMO sector (un flanco), TODOS sobre el mob 7
    const bunched = drive([[50, 0, 7], [55, 0, 7], [60, 0, 7]]);
    // SURROUND: 3 sobre el mob 7 pero desde 3 sectores DISTINTOS (rodeo)
    const surround = drive([[50, 0, 7], [-50, 0, 7], [0, 50, 7]]);
    window.__dev.coFlank({ clearFlank: true }); window.__dev.coFocus({ clearFocus: true });
    window.__dev.coFlank({ enabled: false }); window.__dev.coFocus({ enabled: false });
    return { bunched, surround };
  }, { Z });
  const cruxFocOK =
    cruxFoc.bunched.foc.focus === 3 && cruxFoc.bunched.foc.score === 2 && cruxFoc.bunched.flk.flank === 1 && cruxFoc.bunched.flk.score === 0
    && cruxFoc.surround.foc.focus === 3 && cruxFoc.surround.foc.score === 2 && cruxFoc.surround.flk.flank === 3 && cruxFoc.surround.flk.score === 2;
  ok("6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#144 DIANA (CONTEO ⊥ GEOMETRÍA, REAL server-auth): 3 sobre el MISMO mob AMONTONADOS en un flanco ⇒ DIANA G3/w2 pero TENAZA F1/w0 (convergen pero NO rodean); 3 sobre el MISMO mob desde 3 sectores ⇒ DIANA G3/w2 (IDÉNTICO) pero TENAZA F3/w2 (rodeo) — DIANA es CIEGA a la geometría que TENAZA resuelve (mismo G, F divergente)",
     cruxFocOK, JSON.stringify(cruxFoc));

  // 6b ★ CRUX ⊥#142 PIÑA (player↔player tightness ⊥ player↔target arrangement).
  const cruxCoh = await page.evaluate(() => {
    const flk = (sectors, P) => window.__dev.coFlank({ flankProbe: { sectors, players: P } }).flankProbe;
    const coh = (clustered, P) => window.__dev.coCohesion({ cohesionProbe: { clustered, players: P } }).cohesionProbe;
    // {apiñados C3 pero atacando desde UN flanco F1}: PIÑA C3/w2 pero TENAZA F1/w0
    const A = { flk: flk(1, 3), coh: coh(3, 3) };
    // {dispersos C0 pero rodeando desde 3 sectores F3}: PIÑA C0/w0 pero TENAZA F3/w2
    const B = { flk: flk(3, 3), coh: coh(0, 3) };
    return { A, B };
  });
  const cruxCohOK =
    cruxCoh.A.flk.flank === 1 && cruxCoh.A.flk.weight === 0 && cruxCoh.A.coh.cohesion === 3 && cruxCoh.A.coh.weight === 2
    && cruxCoh.B.flk.flank === 3 && cruxCoh.B.flk.weight === 2 && cruxCoh.B.coh.cohesion === 0 && cruxCoh.B.coh.weight === 0;
  ok("6b ★ CRUX ⊥#142 PIÑA (player↔player tightness ⊥ player↔target arrangement): {apiñados C3, un-flanco F1} ⇒ PIÑA C3/w2 pero TENAZA F1/w0; {dispersos C0, rodeando F3} ⇒ PIÑA C0/w0 pero TENAZA F3/w2 ⇒ estar-apiñado ⊥ rodear-el-objetivo (pesos divergen en AMBOS sentidos)",
     cruxCohOK, JSON.stringify(cruxCoh));

  // 6f ★ CRUX ⊥#108 FLANK_SURGE (⚠️ VERIFICADO — mismo nombre-raíz, mecánica OPUESTA): canal coFlankFind ⊥ flankFind (player-side entero ⊥ mob-side float).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const coFlankCh = (cfgSrc.match(/export const CO_FLANK_SURGE\s*=\s*\{[\s\S]*?channel:\s*"([^"]+)"/) || [])[1];
  const flankCh = (cfgSrc.match(/export const FLANK_SURGE\s*=\s*\{[\s\S]*?channel:\s*"([^"]+)"/) || [])[1];
  const vmCh = await page.evaluate(() => window.__dev.coFlank().channel);
  const chOK = coFlankCh === "coFlankFind" && vmCh === "coFlankFind" && flankCh === "flankFind" && coFlankCh !== flankCh;
  ok("6f ★ CRUX ⊥#108 FLANK_SURGE (canal/lado/métrica DISTINTOS): CO_FLANK_SURGE.channel='coFlankFind' (VM idem) ⊥ FLANK_SURGE.channel='flankFind' — TENAZA = # sectores ENTERO de los JUGADORES alrededor de un mob ⊥ FLANK_SURGE = concentración angular float (resultant-length) de los RUMBOS de los MOBS. CANAL distinto, LADO distinto (party ⊥ enjambre), MÉTRICA distinta (entero ⊥ float)",
     chOK, `coFlankCh=${coFlankCh} vmCh=${vmCh} flankCh=${flankCh}`);

  // 7 ★ F-SENSITIVITY: más sectores angulares ocupados ⇒ F sube.
  const fSens = await page.evaluate(() => {
    const t = (sectors, P) => { const m = window.__dev.coFlank({ flankProbe: { sectors, players: P } }).flankProbe; return { F: m.flank, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), quad: t(4, 4) };
  });
  const fSensOK = fSens.duo.F === 2 && fSens.trio.F === 3 && fSens.quad.F === 4 && fSens.duo.w === 1 && fSens.trio.w === 2 && fSens.quad.w === 2;
  ok("7 ★ F-SENSITIVITY (F sube con más sectores): 2⇒F2/w1, 3⇒F3/w2, 4⇒F4/w2 (TENAZA mide DESDE-CUÁNTOS-SECTORES rodean)",
     fSensOK, JSON.stringify(fSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR (driveFlank REAL): SIN pinza (F=1) ⇒ 0; CON pinza (F≥2) ⇒ >0.
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coFlank({ enabled: true });
    const drive = (rows) => { window.__dev.coFlank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coFlank({ driveFlank: { players: rows.map(r => ({ dx: r[0], dy: r[1], targetId: r[2] })), wipe: true } }).driveFlank;
      const live = window.__dev.coFlank({ flankProbeLive: true }).flankProbeLive;
      return { idx: dv.idx, flank: dv.flank, score: dv.score, players: live.players }; };
    const sp = drive([[50, 0, 7]]);                                    // single sobre 7: F=1 ⇒ 0 (colapso)
    const mp = drive([[50, 0, 7], [-50, 0, 7], [0, 50, 7]]);           // rodeo F3 ⇒ score2 (bien-definido)
    window.__dev.coFlank({ clearFlank: true });
    window.__dev.coFlank({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.flank === 1 && degen.sp.score === 0 && degen.mp.flank === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 sobre un objetivo ⇒ F1/score0; 3 rodeando ⇒ F3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE rodear en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM: dos flankProbe idénticos ⇒ F/w byte-idénticos (popcount ENTERO + banda de umbrales enteros {2,3}, 0-float en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.coFlank({ flankProbe: { sectors: 3, players: 4 } }).flankProbe;
    const b = window.__dev.coFlank({ flankProbe: { sectors: 3, players: 4 } }).flankProbe;
    return { a: { F: a.flank, w: a.weight }, b: { F: b.flank, w: b.weight } };
  });
  const detOK = det.a.F === det.b.F && det.a.w === det.b.w && det.a.F === 3;
  ok("9 ★ INTEGER-DETERMINISM: flankProbe repetido ⇒ F/weight byte-idénticos (popcount ENTERO de máscara de sectores por signo + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 9b ★ ORDER-INDEPENDENCE del OR de máscaras (determinismo): permutar el orden del roster ⇒ MISMO F (el OR es CONMUTATIVO).
  const orderInv = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coFlank({ enabled: true });
    const g = (rows) => { window.__dev.coFlank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      return window.__dev.coFlank({ driveFlank: { players: rows.map(r => ({ dx: r[0], dy: r[1], targetId: r[2] })), wipe: true } }).driveFlank.flank; };
    const a = g([[50, 0, 7], [-50, 0, 7], [0, 50, 7]]);   // sectores {7,1,5} ⇒ F3
    const b = g([[0, 50, 7], [50, 0, 7], [-50, 0, 7]]);   // MISMOS jugadores, orden permutado ⇒ MISMO F3
    window.__dev.coFlank({ clearFlank: true }); window.__dev.coFlank({ enabled: false });
    return { a, b };
  }, { Z });
  ok("9b ★ ORDER-INDEPENDENCE del OR de máscaras: MISMO roster {7,1,5} en 2 órdenes distintos ⇒ MISMO F3 (el OR de sectores es CONMUTATIVO ⇒ orden-independiente ⇒ 2-cliente byte-idéntico sin importar el orden de replicación)",
     orderInv.a === 3 && orderInv.b === 3 && orderInv.a === orderInv.b, JSON.stringify(orderInv));

  // 10 CANAL coFlankFind: forageChargePreview con envolvimiento acreditado >0 ; un-flanco → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coFlank({ enabled: true });
    window.__dev.coFlank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coFlank({ driveFlank: { players: [{ dx: 50, dy: 0, targetId: 7 }, { dx: -50, dy: 0, targetId: 7 }, { dx: 0, dy: 50, targetId: 7 }], wipe: true } });   // envolvimiento-pleno ⇒ score2
    const actVm = window.__dev.coFlank();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coFlank({ driveFlank: { players: [{ dx: 50, dy: 0, targetId: 7 }, { dx: 55, dy: 0, targetId: 7 }], wipe: true } });   // un-flanco (F1) ⇒ score0
    const goVm = window.__dev.coFlank();
    window.__dev.coFlank({ clearFlank: true });
    window.__dev.coFlank({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coFlankFind: forageChargePreview envolvimiento pleno (F≥3) ⇒ charge>0 (==coFlankBonus); con un-flanco (F1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds coFlankBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 3; s <= 9; s++) vals.push(window.__dev.coFlank({ flankProbe: { sectors: s, players: s } }).flankProbe.charge);  // F=s ⇒ w2
    return { max: Math.max(...vals), cap: window.__dev.coFlank().cap };
  });
  ok("11 ★ SUB-CAP: ningún envolvimiento pleno produce charge>coFlankBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full surround available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coFlank({ enabled: true });
    window.__dev.coFlank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coFlank({ driveFlank: { players: [{ dx: 50, dy: 0, targetId: 7 }, { dx: -50, dy: 0, targetId: 7 }, { dx: 0, dy: 50, targetId: 7 }], wipe: true } });   // envolvimiento-pleno disponible
    window.__dev.coFlank({ enabled: false });                          // now OFF
    const off = window.__dev.coFlank();
    window.__dev.coFlank({ enabled: true }); window.__dev.coFlank({ clearFlank: true }); window.__dev.coFlank({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, flank: off.flank };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.flank === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, coFlankBonus(envolvimiento pleno disponible)==0 + forageChargePreview==0 + idx==0 + flank==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling peers no cambia la señal de coFlank.
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coFlank({ enabled: true });
    window.__dev.coFlank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coFlank({ driveFlank: { players: [{ dx: 50, dy: 0, targetId: 7 }, { dx: -50, dy: 0, targetId: 7 }, { dx: 0, dy: 50, targetId: 7 }], wipe: true } }).driveFlank;
    const snap = () => JSON.stringify({ coFocus: window.__dev.coFocus(), coAdvance: window.__dev.coAdvance(), coCohesion: window.__dev.coCohesion(), coTank: window.__dev.coTank(), coSupport: window.__dev.coSupport(), coKill: window.__dev.coKill(), coPresence: window.__dev.coPresence(), coFlee: window.__dev.coFlee(), partyVital: window.__dev.partyVital() });
    const peersOn = snap();
    const cfoPrev = window.__dev.coFocus().enabled, caPrev = window.__dev.coAdvance().enabled, ccPrev = window.__dev.coCohesion().enabled, ctPrev = window.__dev.coTank().enabled, csPrev = window.__dev.coSupport().enabled, ckPrev = window.__dev.coKill().enabled, cpPrev = window.__dev.coPresence().enabled, cfPrev = window.__dev.coFlee().enabled, pvPrev = window.__dev.partyVital().enabled;
    window.__dev.coFocus({ enabled: !cfoPrev }); window.__dev.coAdvance({ enabled: !caPrev }); window.__dev.coCohesion({ enabled: !ccPrev }); window.__dev.coTank({ enabled: !ctPrev }); window.__dev.coSupport({ enabled: !csPrev }); window.__dev.coKill({ enabled: !ckPrev }); window.__dev.coPresence({ enabled: !cpPrev }); window.__dev.coFlee({ enabled: !cfPrev }); window.__dev.partyVital({ enabled: !pvPrev });
    const after = window.__dev.coFlank({ flankProbeLive: true }).flankProbeLive;
    window.__dev.coFocus({ enabled: cfoPrev }); window.__dev.coAdvance({ enabled: caPrev }); window.__dev.coCohesion({ enabled: ccPrev }); window.__dev.coTank({ enabled: ctPrev }); window.__dev.coSupport({ enabled: csPrev }); window.__dev.coKill({ enabled: ckPrev }); window.__dev.coPresence({ enabled: cpPrev }); window.__dev.coFlee({ enabled: cfPrev }); window.__dev.partyVital({ enabled: pvPrev });
    const peersRestored = snap();
    window.__dev.coFlank({ clearFlank: true });
    window.__dev.coFlank({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.flank === after.flank;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeFlank: before.flank, afterFlank: after.flank };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD coFlankFind ⊥ peers: la señal de co-flank (score/flank) NO cambia al togglear CO-FOCUS #144/CO-ADVANCE #143/CO-COHESION #142/CO-TANK #140/CO-SUPPORT #139/CO-KILL #138/CO-PRESENCE #137/CO-FLEE #141/PARTY-VITAL #132; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION CENSUS: served config — 73 `_SURGE` totales, sole-false = CO_FLANK (72 true, incl. CO_FOCUS #144 LIVE).
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coFocLive = census.find(([n]) => n === "CO_FOCUS_SURGE");
  const censusOK = total === 73 && trues === 72 && falses.length === 1 && falses[0] === "CO_FLANK_SURGE" && coFocLive && coFocLive[1] === "true";
  ok("14 ★ 0-REGRESIÓN CENSUS: served config 73 `_SURGE` totales, 72 enabled:true (incl. CO_FOCUS_SURGE #144 LIVE), sole-false = CO_FLANK_SURGE (DARK #145)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coFoc=${coFocLive ? coFocLive[1] : "?"}`);

  // 15 render badge "Tenaza:" drawn ON+surround / not OFF + fps. 🔑 label ÚNICO "Tenaza:" (⊥ #144 'Diana:'/#108 'Falange:'/#143 'Envite:'/#142 'Piña:').
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const drive = () => window.__dev.coFlank({ driveFlank: { players: [{ dx: 50, dy: 0, targetId: 7 }, { dx: -50, dy: 0, targetId: 7 }, { dx: 0, dy: 50, targetId: 7 }], wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Tenaza:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coFlank({ enabled: true });
    window.__dev.coFlank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coFlank({ clearFlank: true });
    window.__dev.coFlank({ enabled: false });
    const enAtOff = window.__dev.coFlank().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z });
  ok("15 render badge \"Tenaza:\" se DIBUJA ON+surround (F>0, re-driven cada frame) y NO OFF (F 0) + fps sano (label ÚNICO ⊥ #144 'Diana:'/#108 'Falange:'/#143 'Envite:'/#142 'Piña:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.coFlank({ enabled: true }); window.__dev.coFlank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coFlank({ driveFlank: { players: [{ dx: 50, dy: 0, targetId: 7 }, { dx: -50, dy: 0, targetId: 7 }, { dx: 0, dy: 50, targetId: 7 }], wipe: true } }); }, { Z });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coFlank({ clearFlank: true }); window.__dev.coFlank({ enabled: false }); });

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
    window.__dev.coFlank({ enabled: true });
    window.__dev.coFlank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coFlank({ driveFlank: { players: [{ dx: 50, dy: 0, targetId: 7 }, { dx: -50, dy: 0, targetId: 7 }, { dx: 0, dy: 50, targetId: 7 }], wipe: true } }).driveFlank;   // F=3 ⇒ score2
    const vm = window.__dev.coFlank();
    const lut = [[2, 2], [3, 3], [1, 1], [4, 4]].map(([sectors, P]) => { const m = window.__dev.coFlank({ flankProbe: { sectors, players: P } }).flankProbe; return { p: m.players, F: m.flank, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coFlank({ flankProbeLive: true }).flankProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coFlank({ clearFlank: true });
    window.__dev.coFlank({ enabled: false });
    return { score: dv.score, idx: dv.idx, flank: dv.flank, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveFlank: live.flank, livePlayers: live.players, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.flank === B.flank && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveFlank === B.liveFlank && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMO envolvimiento F=3 ⇒ score/idx/flank/players/tier/charge + flankProbeLive(field,flank,players,score) + flankProbe LUT (F enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},flank:${A.flank},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveFlank:${A.liveFlank},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},flank:${B.flank},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveFlank:${B.liveFlank},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.coFlank({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coFlank({ enabled: false }));

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
