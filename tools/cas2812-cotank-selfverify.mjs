// CAS-2812 — self-verify for MURALLA (DARK, CO_TANK_SURGE.enabled:false). EVO mecánica #140 (base master 3b77140/8bac315 tras #139 SOCORRO CO_SUPPORT LIVE&served 5f4a11037d5f/815) — EJE FRESCO + CANAL FRESCO, ⊥ a los 81 LIVE #59-#139. El 22º eje de COMPOSICIÓN-DE-INTENCIÓN y la QUINTA faceta de la sub-familia PLAYER-COORDINATION (#136 CÓNCLAVE=ENGANCHADOS, #137 COHORTE=PRESENTES, #138 CUADRILLA=REMATAN, #139 SOCORRO=SOSTIENEN).
// (A) EJE FRESCO = MURALLA/CO-TANK = T = nº de JUGADORES DISTINTOS VIVOS que ABSORBIERON/TOMARON daño de un mob (damage-intake credit) DENTRO DEL RADIO COMPARTIDO del héroe (BURDEN-SPREAD — quién REPARTE la carga de golpes), ⊥ #136 CÓNCLAVE (ENGANCHADOS/aggro'd) y ⊥ #139 SOCORRO (SOSTIENEN) y ⊥ #138 CUADRILLA (REMATAN) y ⊥ #137 COHORTE (PRESENTES) y ⊥ #132 PARTY_VITAL (fracción-de-HP MEDIA = ESTADO). CONTEO CRUDO de absorbedores acreditados, NO fracción (#123 cov/P). SNAPSHOT PURO (lee el damage-intake ya replicado, SIN buffer temporal). 🔑 DETERMINISMO (sev-1): T=cuenta ENTERA de absorbedores acreditados vs umbrales ENTEROS {midBrunt2,hiBrunt3} ⇒ 0-float en el score/decisión. Bandas sobre T: ≥hiBrunt(3) ⇒ carga-plena ⇒ 2; ≥midBrunt(2) ⇒ carga-parcial ⇒ 1; <2 (solitario) ⇒ 0. 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ el héroe solo NO reparte la carga ⇒ T colapsa ⇒ 0 (colapso LIMPIO, IMPOSIBLE en solitario).
// (B) CANAL FRESCO = coTankFind (fichas de muralla por rematar con el co-tank ACREDITADO — NINGUNO de los 81 flags lo usa). Moneda FRESCA (h.coTankBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — MURALLA = BURDEN-SPREAD/CO-TANK (quién ABSORBE) ⊥ TODOS los priores: ⊥#136 CÓNCLAVE (ENGANCHADOS): {2 engaged,0 golpeados} ⇒ CÓNCLAVE F2/w1 pero MURALLA T0/w0 (aggro'd pero esquivando); {refriega sin muster,2 golpeados por AoE} ⇒ MURALLA T2/w1 (AoE sin ser aggro-target, diverge en AMBOS sentidos); ⊥#139 SOCORRO (SOSTIENEN): {2 golpeados,0 sanando} ⇒ MURALLA T2/w1 pero SOCORRO S0/w0; {0 golpeados,3 sanando} ⇒ MURALLA T0/w0 pero SOCORRO S3/w2; ⊥#138 CUADRILLA (REMATAN): {2 golpeados,1 rematando} ⇒ MURALLA T2/w1 pero CUADRILLA K1/w0; ⊥#137 COHORTE (PRESENTES): {4 presentes,0 golpeados} ⇒ COHORTE R4/w2 pero MURALLA T0/w0; ⊥#132 PARTY_VITAL (ESTADO-de-HP): {party full-HP,nadie golpeado} ⇒ TEMPLE W1.0/w2 pero MURALLA T0/w0; {party maltrecha,3 golpeados} ⇒ TEMPLE W0.2/w0 pero MURALLA T3/w2 (ESTADO ⊥ ACCIÓN).
//
// Run: node tools/cas2812-cotank-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2812");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// bruntProbe LUT esperada: (taking=nº absorbedores acreditados en radio, players=P gate)→T=clamp(taking,0,P)→banda(T vs {midBrunt2,hiBrunt3,minPlayers2} ENTEROS)→{weight,rankTier}. UMBRALES hiBrunt 3 / midBrunt 2 + colapso single-player (T<minPlayers2 ⇒ 0).
const EXPECT_BRUNT = [
  { name: "solo-P1",            taking: 1, players: 1, T: 1, w: 0 },   // single-player: T1<midBrunt ⇒ 0 (colapso LIMPIO)
  { name: "duo-P2",             taking: 2, players: 2, T: 2, w: 1 },   // 2 absorbedores ⇒ T2 ⇒ 1
  { name: "duo-of-4",           taking: 2, players: 4, T: 2, w: 1 },   // 🔑 2 absorbedores DE un roster de 4 ⇒ T2 (conteo CRUDO, ⊥ CONTEST fracción 2/4)
  { name: "trio-P3",            taking: 3, players: 3, T: 3, w: 2 },   // 3 absorbedores ⇒ T3 ⇒ 2
  { name: "trio-of-4",          taking: 3, players: 4, T: 3, w: 2 },   // T3 de P4 ⇒ 2
  { name: "full-P4",            taking: 4, players: 4, T: 4, w: 2 },   // 4 absorbedores ⇒ T4 ⇒ 2
  { name: "none-P3",            taking: 0, players: 3, T: 0, w: 0 },   // 🔑 NADIE golpeado (todos presentes pero 0 daño) ⇒ T0 ⇒ 0 (⊥ COHORTE presentes)
  { name: "one-intake-P3",      taking: 1, players: 3, T: 1, w: 0 },   // sólo 1 golpeado de un roster de 3 ⇒ T1 ⇒ 0
  { name: "clamp-overflow",     taking: 9, players: 3, T: 3, w: 2 },   // taking>P se clampa a P=3 ⇒ T3 ⇒ 2
];
// driveBrunt REAL: inyecta roster sintético (P jugadores con offset {dx,dy}, opcional dead/intake) ⇒ T server-auth = # ABSORBEDORES (intake=true) VIVOS DENTRO del radio. Requiere ≥minPlayers(2) absorbedores para banda.
// filas: [dx, dy, dead, intake]
const EXPECT_DRIVE = [
  { name: "duo-intake",         players: [[0, 0, false, true], [44, 0, false, true]],                        T: 2, w: 1 },   // 2 absorbedores en radio ⇒ T2
  { name: "solo-intake",        players: [[0, 0, false, true]],                                              T: 1, w: 0 },   // 1 ⇒ T1 ⇒ 0
  { name: "trio-intake",        players: [[0, 0, false, true], [44, 0, false, true], [0, 44, false, true]],  T: 3, w: 2 },  // 3 ⇒ T3 ⇒ 2
  { name: "far-excluded",       players: [[0, 0, false, true], [44, 0, false, true], [9999, 0, false, true]], T: 2, w: 1 },// 🔑 3º absorbedor fuera de radio (dx 9999) ⇒ EXCLUIDO ⇒ T2 (RADIO-LOCAL)
  { name: "dead-excluded",      players: [[0, 0, false, true], [44, 0, false, true], [30, 30, true, true]],  T: 2, w: 1 },  // 🔑 3º absorbedor MUERTO ⇒ EXCLUIDO ⇒ T2 (ANTI-conteo-de-cadáveres)
  { name: "present-not-taking", players: [[0, 0, false, true], [44, 0, false, true], [30, 30, false, false]], T: 2, w: 1 }, // 🔑 3º PRESENTE en radio pero SIN damage-intake (intake:false) ⇒ EXCLUIDO ⇒ T2 (⊥ #137 COHORTE / #136 CÓNCLAVE: presente/enganchado ≠ golpeado-de-verdad)
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

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.coTank());
  ok("2 byte-id OFF (fresh boot): CO_TANK_SURGE.enabled false AND G.coTankBounty NUNCA se crea (gExists false) AND G._coTankParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.tank === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coTankFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} tank=${dark.tank} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiBrunt=${dark.hiBrunt} midBrunt=${dark.midBrunt} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no coTankFind/coTankBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coTankFind|coTankBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coTankBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'coTankFind'/'coTankBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coTank({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coTank({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ bruntProbe LUT: (taking,players)→T=clamp→banda(T vs {2,3} ENTEROS)→tier→charge (UMBRALES hiBrunt/midBrunt + colapso single-player + clamp).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coTank({ bruntProbe: { taking: c.taking, players: c.players } }).bruntProbe), EXPECT_BRUNT);
  const tabOK = EXPECT_BRUNT.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tank === c.T);
  ok("5 ★ bruntProbe LUT (MURALLA T=#absorbedores acreditados): solo-P1(T1)⇒0, duo(T2)⇒1, duo-of-4(T2)⇒1, trio(T3)⇒2, trio-of-4(T3)⇒2, full(T4)⇒2, none-P3(T0)⇒0, one-intake-P3(T1)⇒0, clamp-overflow⇒T3. UMBRAL hiBrunt 3/midBrunt 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_BRUNT[i].name, p: x.players, T: x.tank, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH MURALLA: driveBrunt inyecta roster sintético (posiciones + vivo/muerto + damage-intake) ⇒ T REAL server-auth (filtra fuera-de-radio + muertos + NO-absorbedores).
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

  // 6 ★ CRUX (LA CRÍTICA) ⊥#136 CÓNCLAVE (BURDEN-SPREAD ⊥ ENGANCHADOS/aggro'd): MURALLA cuenta ABSORBEDORES (golpeados), CÓNCLAVE cuenta ENGANCHADOS (aggro-targeted). aggro-target ⊥ daño-absorbido.
  const cruxCon = await page.evaluate(() => {
    const brunt = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    const muster = (tgts, P) => window.__dev.coStrike({ musterProbe: { tgts, players: P } }).musterProbe;
    // {2 enganchados por 2 mobs, 0 golpeados (esquivan todo)}: CÓNCLAVE F2/w1 pero MURALLA T0/w0
    const A = { brunt: brunt(0, 2), muster: muster([0, 1], 2) };
    // {refriega mínima/sin muster (1 mob ⇒ CÓNCLAVE gated 0), 2 golpeados por AoE}: CÓNCLAVE w0 pero MURALLA T2/w1 (AoE/splash sin ser aggro-target)
    const B = { brunt: brunt(2, 2), muster: muster([0], 2) };
    return { A, B };
  });
  const cruxConOK =
    cruxCon.A.muster.muster === 2 && cruxCon.A.muster.weight === 1 && cruxCon.A.brunt.tank === 0 && cruxCon.A.brunt.weight === 0
    && cruxCon.B.muster.weight === 0 && cruxCon.B.brunt.tank === 2 && cruxCon.B.brunt.weight === 1;
  ok("6 ★ CRUX (LA CRÍTICA) ⊥#136 CÓNCLAVE (BURDEN-SPREAD ⊥ ENGANCHADOS/aggro'd): {2 enganchados,0 golpeados} ⇒ CÓNCLAVE F2/w1 pero MURALLA T0/w0 (aggro'd pero esquivando cada golpe); {refriega sin muster (CÓNCLAVE w0),2 golpeados por AoE} ⇒ MURALLA T2/w1 (AoE sin ser aggro-target) ⇒ aggro-target ⊥ daño-absorbido (pesos divergen en AMBOS sentidos)",
     cruxConOK, JSON.stringify(cruxCon));

  // 6b ★ CRUX ⊥#139 SOCORRO (ABSORBER ⊥ SOSTENER/heal): MURALLA cuenta ABSORBEDORES, SOCORRO cuenta SOCORREDORES.
  const cruxSup = await page.evaluate(() => {
    const brunt = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    const aid = (supporting, P) => window.__dev.coSupport({ aidProbe: { supporting, players: P } }).aidProbe;
    // {2 golpeados, 0 sanando}: MURALLA T2/w1 pero SOCORRO S0/w0 (tanks de frente absorbiendo, 0 heals)
    const A = { brunt: brunt(2, 3), aid: aid(0, 3) };
    // {0 golpeados, 3 sanando}: MURALLA T0/w0 pero SOCORRO S3/w2 (sanadores de retaguardia, 0 golpes)
    const B = { brunt: brunt(0, 3), aid: aid(3, 3) };
    return { A, B };
  });
  const cruxSupOK =
    cruxSup.A.brunt.tank === 2 && cruxSup.A.brunt.weight === 1 && cruxSup.A.aid.aid === 0 && cruxSup.A.aid.weight === 0
    && cruxSup.B.brunt.tank === 0 && cruxSup.B.brunt.weight === 0 && cruxSup.B.aid.aid === 3 && cruxSup.B.aid.weight === 2;
  ok("6b ★ CRUX ⊥#139 SOCORRO (ABSORBER ⊥ SOSTENER): {2 golpeados,0 sanando} ⇒ MURALLA T2/w1 pero SOCORRO S0/w0 (tanks absorben, 0 heals); {0 golpeados,3 sanando} ⇒ MURALLA T0/w0 pero SOCORRO S3/w2 (sanadores 0 golpes) ⇒ TOMAR-golpes ⊥ APLICAR-heals (pesos divergen en AMBOS sentidos)",
     cruxSupOK, JSON.stringify(cruxSup));

  // 6c ★ CRUX ⊥#138 CUADRILLA (ABSORBER ⊥ REMATAR): MURALLA cuenta ABSORBEDORES, CUADRILLA cuenta KILLERS acreditados.
  const cruxKill = await page.evaluate(() => {
    const brunt = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    const kill = (credited, P) => window.__dev.coKill({ hitProbe: { credited, players: P } }).hitProbe;
    // {2 golpeados, 1 rematando}: MURALLA T2/w1 pero CUADRILLA K1/w0 (tanks comen golpes, no landean kill)
    const A = { brunt: brunt(2, 3), kill: kill(1, 3) };
    // {0 golpeados, 3 rematando}: MURALLA T0/w0 pero CUADRILLA K3/w2 (DPS ranged, 0 golpes)
    const B = { brunt: brunt(0, 3), kill: kill(3, 3) };
    return { A, B };
  });
  const cruxKillOK =
    cruxKill.A.brunt.tank === 2 && cruxKill.A.brunt.weight === 1 && cruxKill.A.kill.assist === 1 && cruxKill.A.kill.weight === 0
    && cruxKill.B.brunt.tank === 0 && cruxKill.B.brunt.weight === 0 && cruxKill.B.kill.assist === 3 && cruxKill.B.kill.weight === 2;
  ok("6c ★ CRUX ⊥#138 CUADRILLA (ABSORBER ⊥ REMATAR): {2 golpeados,1 rematando} ⇒ MURALLA T2/w1 pero CUADRILLA K1/w0; {0 golpeados,3 rematando} ⇒ MURALLA T0/w0 pero CUADRILLA K3/w2 ⇒ absorber-carga ⊥ contribuir-remates (pesos divergen en AMBOS sentidos)",
     cruxKillOK, JSON.stringify(cruxKill));

  // 6d ★ CRUX ⊥#137 COHORTE (ABSORBER ⊥ PRESENTES): MURALLA cuenta ABSORBEDORES, COHORTE cuenta PRESENTES.
  const cruxPres = await page.evaluate(() => {
    const brunt = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    const pres = (present, P) => window.__dev.coPresence({ rosterProbe: { present, players: P } }).rosterProbe;
    // {4 presentes, 0 golpeados}: COHORTE R4/w2 vs MURALLA T0/w0 (party llena presente pero nadie recibe golpe)
    const A = { brunt: brunt(0, 4), pres: pres(4, 4) };
    // {2 presentes, 2 golpeados}: COHORTE R2/w1 y MURALLA T2/w1
    const B = { brunt: brunt(2, 2), pres: pres(2, 2) };
    return { A, B };
  });
  const cruxPresOK =
    cruxPres.A.pres.rally === 4 && cruxPres.A.pres.weight === 2 && cruxPres.A.brunt.tank === 0 && cruxPres.A.brunt.weight === 0
    && cruxPres.B.pres.rally === 2 && cruxPres.B.pres.weight === 1 && cruxPres.B.brunt.tank === 2 && cruxPres.B.brunt.weight === 1;
  ok("6d ★ CRUX ⊥#137 COHORTE (ABSORBER ⊥ PRESENTES): {4 presentes,0 golpeados} ⇒ COHORTE R4/w2 pero MURALLA T0/w0; {2 presentes,2 golpeados} ⇒ COHORTE R2/w1 y MURALLA T2/w1 ⇒ PRESENTE ⊥ ABSORBER",
     cruxPresOK, JSON.stringify(cruxPres));

  // 6e ★ CRUX ⊥#132 PARTY_VITAL (ACCIÓN ⊥ ESTADO-de-HP): MURALLA = CONTEO de quién comió un golpe ESTE frame; TEMPLE = FRACCIÓN-de-HP MEDIA (cómo de sana ESTÁ la party). Divergen en AMBOS sentidos.
  const cruxVital = await page.evaluate(() => {
    const brunt = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    const vital = (fracs, mobs) => window.__dev.partyVital({ vitalProbe: { fracs, mobs, hpMax: 1000 } }).vitalProbe;
    // {party full-HP, NADIE golpeado este frame}: TEMPLE W1.0/w2 (sana) pero MURALLA T0/w0 (nadie comió golpe)
    const A = { brunt: brunt(0, 3), vital: vital([1, 1, 1], 3) };
    // {party maltrecha 20%, 3 golpeados este frame}: TEMPLE W0.2/w0 (moribunda) pero MURALLA T3/w2 (3 absorben AHORA)
    const B = { brunt: brunt(3, 3), vital: vital([0.2, 0.2, 0.2], 3) };
    return { A, B };
  });
  const cruxVitalOK =
    cruxVital.A.vital.weight === 2 && cruxVital.A.vital.vital >= 0.99 && cruxVital.A.brunt.tank === 0 && cruxVital.A.brunt.weight === 0
    && cruxVital.B.vital.weight === 0 && cruxVital.B.vital.vital <= 0.3 && cruxVital.B.brunt.tank === 3 && cruxVital.B.brunt.weight === 2;
  ok("6e ★ CRUX ⊥#132 PARTY_VITAL (ACCIÓN ⊥ ESTADO-de-HP): {party full-HP,nadie golpeado} ⇒ TEMPLE W1.0/w2 pero MURALLA T0/w0; {party 20%HP,3 golpeados} ⇒ TEMPLE W0.2/w0 pero MURALLA T3/w2 ⇒ ESTADO-de-HP (float MEDIO, PASIVO) ⊥ CONTEO-de-quién-comió-un-golpe (entero, ACCIÓN), diverge en AMBOS sentidos",
     cruxVitalOK, JSON.stringify(cruxVital));

  // 6f ★ CRUX ⊥#123 CONTEST (CONTEO CRUDO ⊥ FRACCIÓN cov/P): mismo T con distinta cobertura.
  const cruxContest = await page.evaluate(() => {
    const brunt = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    const full = brunt(2, 2);   // 2 de 2: T2, cobertura 1.0
    const half = brunt(2, 4);   // 2 de 4: MISMO T2, pero cobertura 0.5
    return { full, half };
  });
  const cruxContestOK = cruxContest.full.tank === 2 && cruxContest.half.tank === 2 && cruxContest.full.weight === 1 && cruxContest.half.weight === 1;
  ok("6f ★ CRUX ⊥#123 CONTEST (CONTEO ⊥ FRACCIÓN): {2 de 2}(cov 1.0) vs {2 de 4}(cov 0.5) ⇒ MISMO MURALLA T2/w1 (conteo CRUDO de absorbedores, INVARIANTE a la cobertura fraccional)",
     cruxContestOK, JSON.stringify(cruxContest));

  // 7 ★ T-SENSITIVITY: más absorbedores acreditados DENTRO del radio ⇒ T sube.
  const tSens = await page.evaluate(() => {
    const t = (taking, P) => { const m = window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe; return { T: m.tank, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), full: t(4, 4) };
  });
  const tSensOK = tSens.duo.T === 2 && tSens.trio.T === 3 && tSens.full.T === 4 && tSens.duo.w === 1 && tSens.trio.w === 2 && tSens.full.w === 2;
  ok("7 ★ T-SENSITIVITY (T sube con más absorbedores ACREDITADOS): 2⇒T2/w1, 3⇒T3/w2, 4⇒T4/w2 (MURALLA mide el tamaño CRUDO de la línea que reparte la carga)",
     tSensOK, JSON.stringify(tSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: SIN línea de absorbedores (T=1) ⇒ 0; CON línea (T≥2) ⇒ >0.
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coTank({ enabled: true });
    const drive = (rows) => { window.__dev.coTank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coTank({ driveBrunt: { players: rows.map(r => ({ dx: r[0], dy: r[1], intake: true })), wipe: true } }).driveBrunt;
      const live = window.__dev.coTank({ bruntProbeLive: true }).bruntProbeLive;
      return { idx: dv.idx, tank: dv.tank, score: dv.score, players: live.players }; };
    const sp = drive([[0, 0]]);                        // single absorbedor: T=1 ⇒ 0 (colapso)
    const mp = drive([[0, 0], [44, 0], [0, 44]]);      // línea T3 ⇒ score2 (bien-definido)
    window.__dev.coTank({ clearBrunt: true });
    window.__dev.coTank({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.tank === 1 && degen.sp.score === 0 && degen.mp.tank === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 absorbedor ⇒ T1/score0; 3 absorbedores ⇒ T3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE repartir la carga en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM: dos bruntProbe idénticos ⇒ T/w byte-idénticos (conteo ENTERO + banda de umbrales enteros {2,3}, 0-float en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.coTank({ bruntProbe: { taking: 3, players: 4 } }).bruntProbe;
    const b = window.__dev.coTank({ bruntProbe: { taking: 3, players: 4 } }).bruntProbe;
    return { a: { T: a.tank, w: a.weight }, b: { T: b.tank, w: b.weight } };
  });
  const detOK = det.a.T === det.b.T && det.a.w === det.b.w && det.a.T === 3;
  ok("9 ★ INTEGER-DETERMINISM: bruntProbe repetido ⇒ T/weight byte-idénticos (CONTEO ENTERO de absorbedores + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 10 CANAL coTankFind: forageChargePreview con co-tank acreditado >0 ; solitario → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coTank({ enabled: true });
    window.__dev.coTank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coTank({ driveBrunt: { players: [{ dx: 0, dy: 0, intake: true }, { dx: 44, dy: 0, intake: true }, { dx: 0, dy: 44, intake: true }], wipe: true } });   // carga-plena ⇒ score2
    const actVm = window.__dev.coTank();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coTank({ driveBrunt: { players: [{ dx: 0, dy: 0, intake: true }], wipe: true } });   // solitario (T1) ⇒ score0
    const goVm = window.__dev.coTank();
    window.__dev.coTank({ clearBrunt: true });
    window.__dev.coTank({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coTankFind: forageChargePreview carga plena (T≥3) ⇒ charge>0 (==coTankBonus); con solitario (T1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds coTankBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 3; s <= 10; s++) vals.push(window.__dev.coTank({ bruntProbe: { taking: s, players: s } }).bruntProbe.charge);  // T=s ⇒ w2
    return { max: Math.max(...vals), cap: window.__dev.coTank().cap };
  });
  ok("11 ★ SUB-CAP: ninguna carga plena produce charge>coTankBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full co-tank available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coTank({ enabled: true });
    window.__dev.coTank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coTank({ driveBrunt: { players: [{ dx: 0, dy: 0, intake: true }, { dx: 44, dy: 0, intake: true }, { dx: 0, dy: 44, intake: true }], wipe: true } });   // carga-plena disponible
    window.__dev.coTank({ enabled: false });                          // now OFF
    const off = window.__dev.coTank();
    window.__dev.coTank({ enabled: true }); window.__dev.coTank({ clearBrunt: true }); window.__dev.coTank({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, tank: off.tank };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.tank === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, coTankBonus(carga plena disponible)==0 + forageChargePreview==0 + idx==0 + tank==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling coSupport/coKill/coPresence/partyVital no cambia la señal de coTank.
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

  // 14 ★ 0-REGRESSION CENSUS: served config — 68 `_SURGE` totales, sole-false = CO_TANK (67 true, incl. CO_SUPPORT #139 LIVE).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coSupportLive = census.find(([n]) => n === "CO_SUPPORT_SURGE");
  const censusOK = total === 68 && trues === 67 && falses.length === 1 && falses[0] === "CO_TANK_SURGE" && coSupportLive && coSupportLive[1] === "true";
  ok("14 ★ 0-REGRESIÓN CENSUS: served config 68 `_SURGE` totales, 67 enabled:true (incl. CO_SUPPORT_SURGE #139 LIVE), sole-false = CO_TANK_SURGE (DARK #140)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coSupport=${coSupportLive ? coSupportLive[1] : "?"}`);

  // 15 render badge "Muralla:" drawn ON+co-tank / not OFF + fps. 🔑 label ÚNICO "Muralla:" (⊥ #139 'Socorro:'/#138 'Cuadrilla:'/#137 'Cohorte:'/#136 'Cónclave:').
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
    const dv = window.__dev.coTank({ driveBrunt: { players: [{ dx: 0, dy: 0, intake: true }, { dx: 44, dy: 0, intake: true }, { dx: 0, dy: 44, intake: true }], wipe: true } }).driveBrunt;   // T=3 ⇒ score2
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
