// CAS-2814 — POST-FLIP LIVE QA for MURALLA (CO_TANK_SURGE.enabled:TRUE LIVE, EVO#140, 82º flag). Base master b073680 (c74b74b DARK → 9f59e0e flip false→true → b073680 version stamp e1267a40e18c/815), served LIVE carlosdcastrosa-cloud.github.io/Mithralda-Online.
// Derivado del DARK self-verify cas2812 con: ck2 INVERTIDO LIVE-ON (enabled TRUE, solo boot ⇒ T≤1 ⇒ score/tier/charge colapsan LIMPIO), ck14 CENSUS INVERTIDO (68/68 enabled:true off=[]), + ck18 SERVED-LIVE-BUILD (root200 + version.json e1267a40e18c/815 + served config CO_TANK_SURGE enabled:true + census 68/68). Gameplay/determinismo corre contra checkout local NO-DRIFT (HEAD==origin==b073680, byte-idéntico a lo servido); ck18 verifica los BYTES SERVIDOS.
// (A) EJE = MURALLA/CO-TANK = T = nº de JUGADORES DISTINTOS VIVOS que TOMARON daño de un mob (damage-intake credit) DENTRO DEL RADIO COMPARTIDO del héroe (BURDEN-SPREAD — quién REPARTE la carga de golpes), ⊥ #136 CÓNCLAVE (ENGANCHADOS) ⊥ #139 SOCORRO (SOSTIENEN) ⊥ #138 CUADRILLA (REMATAN) ⊥ #137 COHORTE (PRESENTES) ⊥ #132 PARTY_VITAL (fracción-HP MEDIA = ESTADO). CONTEO CRUDO (⊥ #123 cov/P). SNAPSHOT PURO. 🔑 DETERMINISMO (sev-1): T=cuenta ENTERA vs umbrales ENTEROS {midBrunt2,hiBrunt3} ⇒ 0-float. Bandas: ≥hiBrunt(3)⇒2; ≥midBrunt(2)⇒1; <2(solitario)⇒0. 🔑 MULTIJUGADOR-NATIVO: solo ⇒ T colapsa ⇒ 0.
// (B) CANAL = coTankFind (h.coTankBounty TRANSITORIA, fuera del save allowlist + worldFingerprint).
//
// Run: node tools/cas2814-cotank-live-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE_BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2814");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// bruntProbe LUT: (taking=nº absorbedores acreditados en radio, players=P gate)→T=clamp(taking,0,P)→banda(T vs {midBrunt2,hiBrunt3,minPlayers2} ENTEROS)→{weight,rankTier}.
const EXPECT_BRUNT = [
  { name: "solo-P1",            taking: 1, players: 1, T: 1, w: 0 },
  { name: "duo-P2",             taking: 2, players: 2, T: 2, w: 1 },
  { name: "duo-of-4",           taking: 2, players: 4, T: 2, w: 1 },
  { name: "trio-P3",            taking: 3, players: 3, T: 3, w: 2 },
  { name: "trio-of-4",          taking: 3, players: 4, T: 3, w: 2 },
  { name: "full-P4",            taking: 4, players: 4, T: 4, w: 2 },
  { name: "none-P3",            taking: 0, players: 3, T: 0, w: 0 },
  { name: "one-intake-P3",      taking: 1, players: 3, T: 1, w: 0 },
  { name: "clamp-overflow",     taking: 9, players: 3, T: 3, w: 2 },
];
// driveBrunt REAL: [dx, dy, dead, intake]
const EXPECT_DRIVE = [
  { name: "duo-intake",         players: [[0, 0, false, true], [44, 0, false, true]],                        T: 2, w: 1 },
  { name: "solo-intake",        players: [[0, 0, false, true]],                                              T: 1, w: 0 },
  { name: "trio-intake",        players: [[0, 0, false, true], [44, 0, false, true], [0, 44, false, true]],  T: 3, w: 2 },
  { name: "far-excluded",       players: [[0, 0, false, true], [44, 0, false, true], [9999, 0, false, true]], T: 2, w: 1 },
  { name: "dead-excluded",      players: [[0, 0, false, true], [44, 0, false, true], [30, 30, true, true]],  T: 2, w: 1 },
  { name: "present-not-taking", players: [[0, 0, false, true], [44, 0, false, true], [30, 30, false, false]], T: 2, w: 1 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coTank && window.__dev.coSupport && window.__dev.coKill && window.__dev.coPresence && window.__dev.coStrike && window.__dev.partyVital && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coTank + peer hooks (coSupport/coKill/coPresence/coStrike/partyVital) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE-ON fresh boot (INVERTED from DARK): CO_TANK_SURGE.enabled TRUE; solo hero fresh boot, sin damage-intake acreditado en radio ⇒ T≤1 < midBrunt2 ⇒ SCORE/DECISIÓN colapsan LIMPIO (tier/score/tank/charge/preview=0). Multijugador-nativo: IMPOSIBLE dispararse en solitario. channel fresco coTankFind + tag vacío. 🔑 NO asertamos gExists/partyExists (con enabled:true las estructuras transitorias PUEDEN materializarse — aserta el COLAPSO DE DECISIÓN, no la existencia).
  const dark = await page.evaluate(() => window.__dev.coTank());
  ok("2 LIVE-ON (fresh solo boot): CO_TANK_SURGE.enabled TRUE AND sin línea de absorción (T≤1) ⇒ score/tier/tank/charge/preview colapsan LIMPIO a 0 AND channel coTankFind AND tag vacío",
     dark.enabled === true && dark.tier === 0 && dark.score === 0 && dark.tank <= 1 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coTankFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} tank=${dark.tank} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiBrunt=${dark.hiBrunt} midBrunt=${dark.midBrunt} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save has no coTankFind/coTankBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coTankFind|coTankBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coTankBounty"\s*:/.test(saveOff);
  ok("3 byte-id save: sin clave 'coTankFind'/'coTankBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coTank({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coTank({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ bruntProbe LUT
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coTank({ bruntProbe: { taking: c.taking, players: c.players } }).bruntProbe), EXPECT_BRUNT);
  const tabOK = EXPECT_BRUNT.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tank === c.T);
  ok("5 ★ bruntProbe LUT (MURALLA T=#absorbedores acreditados): solo-P1(T1)⇒0, duo(T2)⇒1, duo-of-4(T2)⇒1, trio(T3)⇒2, trio-of-4(T3)⇒2, full(T4)⇒2, none-P3(T0)⇒0, one-intake-P3(T1)⇒0, clamp-overflow⇒T3. UMBRAL hiBrunt 3/midBrunt 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_BRUNT[i].name, p: x.players, T: x.tank, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH MURALLA
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z } = args;
    const mkParty = (rows) => rows.map((r) => ({ dx: r[0], dy: r[1], dead: !!r[2], intake: !!r[3] }));
    window.__dev.coTank({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coTank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coTank({ driveBrunt: { players: mkParty(c.players), wipe: true } }).driveBrunt;
      const live = window.__dev.coTank({ bruntProbeLive: true }).bruntProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvTank: dv.tank, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveTank: live.tank, livePlayers: live.players });
    }
    window.__dev.coTank({ clearBrunt: true });
    window.__dev.coTank({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvTank === c.T && comp[i].liveTank === c.T);
  ok("5c ★ REAL SERVER-AUTH MURALLA (damage-intake snapshot): duo-intake(T2)=w1, solo(T1)=w0, trio(T3)=w2, far-excluded(dx9999⇒T2)=w1, dead-excluded(T2)=w1, present-not-taking(intake:false⇒T2)=w1 (filtra RADIO + muertos + NO-absorbedores)",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA) ⊥#136 CÓNCLAVE (BURDEN-SPREAD ⊥ ENGANCHADOS/aggro'd)
  const cruxCon = await page.evaluate(() => {
    const brunt = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    const muster = (tgts, P) => window.__dev.coStrike({ musterProbe: { tgts, players: P } }).musterProbe;
    const A = { brunt: brunt(0, 2), muster: muster([0, 1], 2) };
    const B = { brunt: brunt(2, 2), muster: muster([0], 2) };
    return { A, B };
  });
  const cruxConOK =
    cruxCon.A.muster.muster === 2 && cruxCon.A.muster.weight === 1 && cruxCon.A.brunt.tank === 0 && cruxCon.A.brunt.weight === 0
    && cruxCon.B.muster.weight === 0 && cruxCon.B.brunt.tank === 2 && cruxCon.B.brunt.weight === 1;
  ok("6 ★ CRUX (LA CRÍTICA) ⊥#136 CÓNCLAVE (BURDEN-SPREAD ⊥ ENGANCHADOS/aggro'd): {2 enganchados,0 golpeados} ⇒ CÓNCLAVE F2/w1 pero MURALLA T0/w0 (aggro'd pero esquivando cada golpe); {refriega sin muster (CÓNCLAVE w0),2 golpeados por AoE} ⇒ MURALLA T2/w1 (AoE sin ser aggro-target) ⇒ aggro-target ⊥ daño-absorbido (pesos divergen en AMBOS sentidos)",
     cruxConOK, JSON.stringify(cruxCon));

  // 6b ★ CRUX ⊥#139 SOCORRO (ABSORBER ⊥ SOSTENER/heal)
  const cruxSup = await page.evaluate(() => {
    const brunt = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    const aid = (supporting, P) => window.__dev.coSupport({ aidProbe: { supporting, players: P } }).aidProbe;
    const A = { brunt: brunt(2, 3), aid: aid(0, 3) };
    const B = { brunt: brunt(0, 3), aid: aid(3, 3) };
    return { A, B };
  });
  const cruxSupOK =
    cruxSup.A.brunt.tank === 2 && cruxSup.A.brunt.weight === 1 && cruxSup.A.aid.aid === 0 && cruxSup.A.aid.weight === 0
    && cruxSup.B.brunt.tank === 0 && cruxSup.B.brunt.weight === 0 && cruxSup.B.aid.aid === 3 && cruxSup.B.aid.weight === 2;
  ok("6b ★ CRUX ⊥#139 SOCORRO (ABSORBER ⊥ SOSTENER): {2 golpeados,0 sanando} ⇒ MURALLA T2/w1 pero SOCORRO S0/w0; {0 golpeados,3 sanando} ⇒ MURALLA T0/w0 pero SOCORRO S3/w2 ⇒ TOMAR-golpes ⊥ APLICAR-heals (pesos divergen en AMBOS sentidos)",
     cruxSupOK, JSON.stringify(cruxSup));

  // 6c ★ CRUX ⊥#138 CUADRILLA (ABSORBER ⊥ REMATAR)
  const cruxKill = await page.evaluate(() => {
    const brunt = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    const kill = (credited, P) => window.__dev.coKill({ hitProbe: { credited, players: P } }).hitProbe;
    const A = { brunt: brunt(2, 3), kill: kill(1, 3) };
    const B = { brunt: brunt(0, 3), kill: kill(3, 3) };
    return { A, B };
  });
  const cruxKillOK =
    cruxKill.A.brunt.tank === 2 && cruxKill.A.brunt.weight === 1 && cruxKill.A.kill.assist === 1 && cruxKill.A.kill.weight === 0
    && cruxKill.B.brunt.tank === 0 && cruxKill.B.brunt.weight === 0 && cruxKill.B.kill.assist === 3 && cruxKill.B.kill.weight === 2;
  ok("6c ★ CRUX ⊥#138 CUADRILLA (ABSORBER ⊥ REMATAR): {2 golpeados,1 rematando} ⇒ MURALLA T2/w1 pero CUADRILLA K1/w0; {0 golpeados,3 rematando} ⇒ MURALLA T0/w0 pero CUADRILLA K3/w2 ⇒ absorber-carga ⊥ contribuir-remates (pesos divergen en AMBOS sentidos)",
     cruxKillOK, JSON.stringify(cruxKill));

  // 6d ★ CRUX ⊥#137 COHORTE (ABSORBER ⊥ PRESENTES)
  const cruxPres = await page.evaluate(() => {
    const brunt = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    const pres = (present, P) => window.__dev.coPresence({ rosterProbe: { present, players: P } }).rosterProbe;
    const A = { brunt: brunt(0, 4), pres: pres(4, 4) };
    const B = { brunt: brunt(2, 2), pres: pres(2, 2) };
    return { A, B };
  });
  const cruxPresOK =
    cruxPres.A.pres.rally === 4 && cruxPres.A.pres.weight === 2 && cruxPres.A.brunt.tank === 0 && cruxPres.A.brunt.weight === 0
    && cruxPres.B.pres.rally === 2 && cruxPres.B.pres.weight === 1 && cruxPres.B.brunt.tank === 2 && cruxPres.B.brunt.weight === 1;
  ok("6d ★ CRUX ⊥#137 COHORTE (ABSORBER ⊥ PRESENTES): {4 presentes,0 golpeados} ⇒ COHORTE R4/w2 pero MURALLA T0/w0; {2 presentes,2 golpeados} ⇒ COHORTE R2/w1 y MURALLA T2/w1 ⇒ PRESENTE ⊥ ABSORBER",
     cruxPresOK, JSON.stringify(cruxPres));

  // 6e ★ CRUX ⊥#132 PARTY_VITAL (ACCIÓN ⊥ ESTADO-de-HP)
  const cruxVital = await page.evaluate(() => {
    const brunt = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    const vital = (fracs, mobs) => window.__dev.partyVital({ vitalProbe: { fracs, mobs, hpMax: 1000 } }).vitalProbe;
    const A = { brunt: brunt(0, 3), vital: vital([1, 1, 1], 3) };
    const B = { brunt: brunt(3, 3), vital: vital([0.2, 0.2, 0.2], 3) };
    return { A, B };
  });
  const cruxVitalOK =
    cruxVital.A.vital.weight === 2 && cruxVital.A.vital.vital >= 0.99 && cruxVital.A.brunt.tank === 0 && cruxVital.A.brunt.weight === 0
    && cruxVital.B.vital.weight === 0 && cruxVital.B.vital.vital <= 0.3 && cruxVital.B.brunt.tank === 3 && cruxVital.B.brunt.weight === 2;
  ok("6e ★ CRUX ⊥#132 PARTY_VITAL (ACCIÓN ⊥ ESTADO-de-HP): {party full-HP,nadie golpeado} ⇒ TEMPLE W1.0/w2 pero MURALLA T0/w0; {party 20%HP,3 golpeados} ⇒ TEMPLE W0.2/w0 pero MURALLA T3/w2 ⇒ ESTADO-de-HP (float MEDIO, PASIVO) ⊥ CONTEO-de-quién-comió-un-golpe (entero, ACCIÓN), diverge en AMBOS sentidos",
     cruxVitalOK, JSON.stringify(cruxVital));

  // 6f ★ CRUX ⊥#123 CONTEST (CONTEO CRUDO ⊥ FRACCIÓN cov/P)
  const cruxContest = await page.evaluate(() => {
    const brunt = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    const full = brunt(2, 2);
    const half = brunt(2, 4);
    return { full, half };
  });
  const cruxContestOK = cruxContest.full.tank === 2 && cruxContest.half.tank === 2 && cruxContest.full.weight === 1 && cruxContest.half.weight === 1;
  ok("6f ★ CRUX ⊥#123 CONTEST (CONTEO ⊥ FRACCIÓN): {2 de 2}(cov 1.0) vs {2 de 4}(cov 0.5) ⇒ MISMO MURALLA T2/w1 (conteo CRUDO de absorbedores, INVARIANTE a la cobertura fraccional)",
     cruxContestOK, JSON.stringify(cruxContest));

  // 7 ★ T-SENSITIVITY
  const tSens = await page.evaluate(() => {
    const t = (taking, P) => { const m = window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe; return { T: m.tank, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), full: t(4, 4) };
  });
  const tSensOK = tSens.duo.T === 2 && tSens.trio.T === 3 && tSens.full.T === 4 && tSens.duo.w === 1 && tSens.trio.w === 2 && tSens.full.w === 2;
  ok("7 ★ T-SENSITIVITY (T sube con más absorbedores ACREDITADOS): 2⇒T2/w1, 3⇒T3/w2, 4⇒T4/w2 (MURALLA mide el tamaño CRUDO de la línea que reparte la carga)",
     tSensOK, JSON.stringify(tSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coTank({ enabled: true });
    const drive = (rows) => { window.__dev.coTank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coTank({ driveBrunt: { players: rows.map(r => ({ dx: r[0], dy: r[1], intake: true })), wipe: true } }).driveBrunt;
      const live = window.__dev.coTank({ bruntProbeLive: true }).bruntProbeLive;
      return { idx: dv.idx, tank: dv.tank, score: dv.score, players: live.players }; };
    const sp = drive([[0, 0]]);
    const mp = drive([[0, 0], [44, 0], [0, 44]]);
    window.__dev.coTank({ clearBrunt: true });
    window.__dev.coTank({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.tank === 1 && degen.sp.score === 0 && degen.mp.tank === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 absorbedor ⇒ T1/score0; 3 absorbedores ⇒ T3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE repartir la carga en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM
  const det = await page.evaluate(() => {
    const a = window.__dev.coTank({ bruntProbe: { taking: 3, players: 4 } }).bruntProbe;
    const b = window.__dev.coTank({ bruntProbe: { taking: 3, players: 4 } }).bruntProbe;
    return { a: { T: a.tank, w: a.weight }, b: { T: b.tank, w: b.weight } };
  });
  const detOK = det.a.T === det.b.T && det.a.w === det.b.w && det.a.T === 3;
  ok("9 ★ INTEGER-DETERMINISM: bruntProbe repetido ⇒ T/weight byte-idénticos (CONTEO ENTERO de absorbedores + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 10 CANAL coTankFind
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coTank({ enabled: true });
    window.__dev.coTank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coTank({ driveBrunt: { players: [{ dx: 0, dy: 0, intake: true }, { dx: 44, dy: 0, intake: true }, { dx: 0, dy: 44, intake: true }], wipe: true } });
    const actVm = window.__dev.coTank();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coTank({ driveBrunt: { players: [{ dx: 0, dy: 0, intake: true }], wipe: true } });
    const goVm = window.__dev.coTank();
    window.__dev.coTank({ clearBrunt: true });
    window.__dev.coTank({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coTankFind: forageChargePreview carga plena (T≥3) ⇒ charge>0 (==coTankBonus); con solitario (T1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 3; s <= 10; s++) vals.push(window.__dev.coTank({ bruntProbe: { taking: s, players: s } }).bruntProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.coTank().cap };
  });
  ok("11 ★ SUB-CAP: ninguna carga plena produce charge>coTankBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coTank({ enabled: true });
    window.__dev.coTank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coTank({ driveBrunt: { players: [{ dx: 0, dy: 0, intake: true }, { dx: 44, dy: 0, intake: true }, { dx: 0, dy: 44, intake: true }], wipe: true } });
    window.__dev.coTank({ enabled: false });
    const off = window.__dev.coTank();
    window.__dev.coTank({ enabled: true }); window.__dev.coTank({ clearBrunt: true }); window.__dev.coTank({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, tank: off.tank };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.tank === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, coTankBonus(carga plena disponible)==0 + forageChargePreview==0 + idx==0 + tank==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coTank({ enabled: true });
    window.__dev.coTank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coTank({ driveBrunt: { players: [{ dx: 0, dy: 0, intake: true }, { dx: 44, dy: 0, intake: true }, { dx: 0, dy: 44, intake: true }], wipe: true } }).driveBrunt;
    const snap = () => JSON.stringify({ coSupport: window.__dev.coSupport(), coKill: window.__dev.coKill(), coPresence: window.__dev.coPresence(), partyVital: window.__dev.partyVital() });
    const peersOn = snap();
    const csPrev = window.__dev.coSupport().enabled, ckPrev = window.__dev.coKill().enabled, cpPrev = window.__dev.coPresence().enabled, pvPrev = window.__dev.partyVital().enabled;
    window.__dev.coSupport({ enabled: !csPrev }); window.__dev.coKill({ enabled: !ckPrev }); window.__dev.coPresence({ enabled: !cpPrev }); window.__dev.partyVital({ enabled: !pvPrev });
    const after = window.__dev.coTank({ bruntProbeLive: true }).bruntProbeLive;
    window.__dev.coSupport({ enabled: csPrev }); window.__dev.coKill({ enabled: ckPrev }); window.__dev.coPresence({ enabled: cpPrev }); window.__dev.partyVital({ enabled: pvPrev });
    const peersRestored = snap();
    window.__dev.coTank({ clearBrunt: true });
    window.__dev.coTank({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.tank === after.tank;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeTank: before.tank, afterTank: after.tank };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD coTankFind ⊥ peers: la señal de co-tank (score/tank) NO cambia al togglear CO-SUPPORT #139/CO-KILL #138/CO-PRESENCE #137/PARTY-VITAL #132; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION CENSUS (INVERTED LIVE-ON): served config — 68 `_SURGE` totales, 68 enabled:true, off=[] (CO_TANK #140 LIVE + CO_SUPPORT #139 LIVE + los 80 priores).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coTankLive = census.find(([n]) => n === "CO_TANK_SURGE");
  const coSupportLive = census.find(([n]) => n === "CO_SUPPORT_SURGE");
  const censusOK = total === 68 && trues === 68 && falses.length === 0 && coTankLive && coTankLive[1] === "true" && coSupportLive && coSupportLive[1] === "true";
  ok("14 ★ LIVE-ON 0-REGRESIÓN CENSUS (INVERTED): served config 68 `_SURGE` totales, 68 enabled:true, off=[] (CO_TANK_SURGE #140 LIVE + CO_SUPPORT_SURGE #139 LIVE + los 80 priores)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coTank=${coTankLive ? coTankLive[1] : "?"} coSupport=${coSupportLive ? coSupportLive[1] : "?"}`);

  // 15 render badge "Muralla:" drawn ON+co-tank / not OFF + fps
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const drive = () => window.__dev.coTank({ driveBrunt: { players: [{ dx: 0, dy: 0, intake: true }, { dx: 44, dy: 0, intake: true }, { dx: 0, dy: 44, intake: true }], wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Muralla:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coTank({ enabled: true });
    window.__dev.coTank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coTank({ clearBrunt: true });
    window.__dev.coTank({ enabled: false });
    const enAtOff = window.__dev.coTank().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z });
  ok("15 render badge \"Muralla:\" se DIBUJA ON+co-tank (T>0, re-driven cada frame) y NO OFF (T 0) + fps sano (label ÚNICO ⊥ #139 'Socorro:'/#138 'Cuadrilla:'/#137 'Cohorte:'/#136 'Cónclave:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.coTank({ enabled: true }); window.__dev.coTank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coTank({ driveBrunt: { players: [{ dx: 0, dy: 0, intake: true }, { dx: 44, dy: 0, intake: true }, { dx: 0, dy: 44, intake: true }], wipe: true } }); }, { Z });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coTank({ clearBrunt: true }); window.__dev.coTank({ enabled: false }); });

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
    window.__dev.coTank({ enabled: true });
    window.__dev.coTank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coTank({ driveBrunt: { players: [{ dx: 0, dy: 0, intake: true }, { dx: 44, dy: 0, intake: true }, { dx: 0, dy: 44, intake: true }], wipe: true } }).driveBrunt;
    const vm = window.__dev.coTank();
    const lut = [[2, 2], [3, 3], [1, 1], [4, 4]].map(([taking, P]) => { const m = window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe; return { p: m.players, T: m.tank, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coTank({ bruntProbeLive: true }).bruntProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coTank({ clearBrunt: true });
    window.__dev.coTank({ enabled: false });
    return { score: dv.score, idx: dv.idx, tank: dv.tank, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveTank: live.tank, livePlayers: live.players, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.tank === B.tank && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveTank === B.liveTank && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMO damage-intake T=3 ⇒ score/idx/tank/players/tier/charge + bruntProbeLive(field,tank,players,score) + bruntProbe LUT (T enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},tank:${A.tank},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveTank:${A.liveTank},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},tank:${B.tank},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveTank:${B.liveTank},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.coTank({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coTank({ enabled: false }));

  // 18 ★ SERVED LIVE BUILD (gh-pages, no publish lag): root 200 + version.json == e1267a40e18c/815 (NEW ≠ old 5f4a11037d5f) + served sim/config.js CO_TANK_SURGE enabled:true + census 68/68 off=[].
  try {
    const rootRes = await fetch(LIVE_BASE + "/");
    const verRes = await fetch(LIVE_BASE + "/version.json");
    const ver = await verRes.json();
    const cfgRes = await fetch(LIVE_BASE + "/sim/config.js");
    const cfgTxt = await cfgRes.text();
    const lcensus = [...cfgTxt.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
    const lTotal = lcensus.length;
    const lFalses = lcensus.filter(([, v]) => v !== "true").map(([n]) => n);
    const lTrues = lcensus.filter(([, v]) => v === "true").length;
    const lCoTank = lcensus.find(([n]) => n === "CO_TANK_SURGE");
    const servedOK = rootRes.status === 200 && ver.build === "e1267a40e18c" && ver.files === 815 && lTotal === 68 && lTrues === 68 && lFalses.length === 0 && lCoTank && lCoTank[1] === "true";
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json e1267a40e18c/815 (NEW ≠ old 5f4a11037d5f) + served sim/config.js CO_TANK_SURGE enabled:true + census 68/68 off=[]",
       servedOK, `rootStatus=${rootRes.status} build=${ver.build} files=${ver.files} census total=${lTotal} true=${lTrues} false=${JSON.stringify(lFalses)} coTank=${lCoTank ? lCoTank[1] : "?"}`);
  } catch (e) {
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json e1267a40e18c/815 + config CO_TANK_SURGE enabled:true", false, `FETCH ERROR ${String(e)}`);
  }

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
