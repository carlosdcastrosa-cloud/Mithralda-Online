// CAS-2815 — self-verify for REPLIEGUE (DARK, CO_FLEE_SURGE.enabled:false). EVO mecánica #141 (base master 0ebe414 tras #140 MURALLA CO_TANK LIVE&served e1267a40e18c/815) — EJE FRESCO + CANAL FRESCO, ⊥ a los 82 LIVE #59-#140. El 23º eje de COMPOSICIÓN-DE-INTENCIÓN y la SEXTA faceta de la sub-familia PLAYER-COORDINATION (#136 CÓNCLAVE=ENGANCHADOS, #137 COHORTE=PRESENTES, #138 CUADRILLA=REMATAN, #139 SOCORRO=SOSTIENEN, #140 MURALLA=ABSORBEN).
// (A) EJE FRESCO = REPLIEGUE/CO-FLEE = D = nº de JUGADORES DISTINTOS VIVOS que ROMPIERON contacto / se REPOSICIONARON ALEJÁNDOSE de su amenaza más cercana (disengage-reposition) DENTRO DEL RADIO COMPARTIDO del héroe (KITE COORDINADO — quién SE ALEJA de la amenaza), ⊥ #140 MURALLA (ABSORBEN/damage-intake, el vecino MÁS cercano) y ⊥ #136 CÓNCLAVE (ENGANCHADOS/aggro'd) y ⊥ #139 SOCORRO (SOSTIENEN) y ⊥ #138 CUADRILLA (REMATAN) y ⊥ #137 COHORTE (PRESENTES) y ⊥ #132 PARTY_VITAL (fracción-de-HP MEDIA = ESTADO). CONTEO CRUDO de kiters, NO fracción (#123 cov/P). SNAPSHOT PURO (lee la pos/vel ya replicada, SIN buffer temporal). 🔑 DETERMINISMO (sev-1): D=cuenta ENTERA de kiters vs umbrales ENTEROS {midFlee2,hiFlee3} ⇒ 0-float en el score/decisión. Bandas sobre D: ≥hiFlee(3) ⇒ repliegue-pleno ⇒ 2; ≥midFlee(2) ⇒ repliegue-parcial ⇒ 1; <2 (solitario) ⇒ 0. 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ el héroe solo NO co-kitea ⇒ D colapsa ⇒ 0 (colapso LIMPIO, IMPOSIBLE en solitario).
// (B) CANAL FRESCO = coFleeFind (fichas de repliegue por rematar con el co-flee ACREDITADO — NINGUNO de los 82 flags lo usa). Moneda FRESCA (h.coFleeBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — REPLIEGUE = KITE/DISENGAGE-REPOSITION (quién SE ALEJA) ⊥ TODOS los priores: ⊥#140 MURALLA (ABSORBEN, PRIMARIO): {2 absorbiendo/plantados,0 replegándose} ⇒ MURALLA T2/w1 pero REPLIEGUE D0/w0 (comen el golpe, no se mueven); {0 absorbiendo,3 replegándose} ⇒ MURALLA T0/w0 pero REPLIEGUE D3/w2 (kitean ilesos) — TOMAR-el-golpe ⊥ EVITAR-el-golpe, diverge en AMBOS sentidos; ⊥#136 CÓNCLAVE (aggro'd): {2 engaged,0 replegándose} ⇒ CÓNCLAVE F2/w1 pero REPLIEGUE D0 (aggro'd y plantado); {sin muster,2 replegándose} ⇒ REPLIEGUE D2/w1; ⊥#139 SOCORRO: {2 replegándose,0 sanando} vs {0 replegándose,3 sanando}; ⊥#137 COHORTE: {4 presentes,0 replegándose} ⇒ COHORTE R4/w2 pero REPLIEGUE D0; ⊥#132 PARTY_VITAL (ESTADO-de-HP): {party full-HP,nadie replegándose} ⇒ TEMPLE W1.0/w2 pero REPLIEGUE D0; {party maltrecha,3 replegándose} ⇒ TEMPLE W0.2/w0 pero REPLIEGUE D3/w2 (ESTADO ⊥ ACCIÓN).
//
// Run: node tools/cas2815-coflee-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2815");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// fleeProbe LUT esperada: (breaking=nº kiters replegándose en radio, players=P gate)→D=clamp(breaking,0,P)→banda(D vs {midFlee2,hiFlee3,minPlayers2} ENTEROS)→{weight,rankTier}. UMBRALES hiFlee 3 / midFlee 2 + colapso single-player (D<minPlayers2 ⇒ 0).
const EXPECT_FLEE = [
  { name: "solo-P1",            breaking: 1, players: 1, D: 1, w: 0 },   // single-player: D1<midFlee ⇒ 0 (colapso LIMPIO)
  { name: "duo-P2",             breaking: 2, players: 2, D: 2, w: 1 },   // 2 kiters ⇒ D2 ⇒ 1
  { name: "duo-of-4",           breaking: 2, players: 4, D: 2, w: 1 },   // 🔑 2 kiters DE un roster de 4 ⇒ D2 (conteo CRUDO, ⊥ CONTEST fracción 2/4)
  { name: "trio-P3",            breaking: 3, players: 3, D: 3, w: 2 },   // 3 kiters ⇒ D3 ⇒ 2
  { name: "trio-of-4",          breaking: 3, players: 4, D: 3, w: 2 },   // D3 de P4 ⇒ 2
  { name: "full-P4",            breaking: 4, players: 4, D: 4, w: 2 },   // 4 kiters ⇒ D4 ⇒ 2
  { name: "none-P3",            breaking: 0, players: 3, D: 0, w: 0 },   // 🔑 NADIE replegándose (todos presentes pero 0 disengage) ⇒ D0 ⇒ 0 (⊥ COHORTE presentes)
  { name: "one-flee-P3",        breaking: 1, players: 3, D: 1, w: 0 },   // sólo 1 replegándose de un roster de 3 ⇒ D1 ⇒ 0
  { name: "clamp-overflow",     breaking: 9, players: 3, D: 3, w: 2 },   // breaking>P se clampa a P=3 ⇒ D3 ⇒ 2
];
// driveFlee REAL: inyecta roster sintético (P jugadores con offset {dx,dy}, opcional dead/flee) ⇒ D server-auth = # KITERS (flee=true) VIVOS DENTRO del radio. Requiere ≥minPlayers(2) kiters para banda.
// filas: [dx, dy, dead, flee]
const EXPECT_DRIVE = [
  { name: "duo-flee",           players: [[0, 0, false, true], [44, 0, false, true]],                        D: 2, w: 1 },   // 2 kiters en radio ⇒ D2
  { name: "solo-flee",          players: [[0, 0, false, true]],                                              D: 1, w: 0 },   // 1 ⇒ D1 ⇒ 0
  { name: "trio-flee",          players: [[0, 0, false, true], [44, 0, false, true], [0, 44, false, true]],  D: 3, w: 2 },  // 3 ⇒ D3 ⇒ 2
  { name: "far-excluded",       players: [[0, 0, false, true], [44, 0, false, true], [9999, 0, false, true]], D: 2, w: 1 },// 🔑 3º kiter fuera de radio (dx 9999) ⇒ EXCLUIDO ⇒ D2 (RADIO-LOCAL)
  { name: "dead-excluded",      players: [[0, 0, false, true], [44, 0, false, true], [30, 30, true, true]],  D: 2, w: 1 },  // 🔑 3º kiter MUERTO ⇒ EXCLUIDO ⇒ D2 (ANTI-conteo-de-cadáveres)
  { name: "present-not-fleeing",players: [[0, 0, false, true], [44, 0, false, true], [30, 30, false, false]], D: 2, w: 1 }, // 🔑 3º PRESENTE en radio pero SIN disengage (flee:false) ⇒ EXCLUIDO ⇒ D2 (⊥ #137 COHORTE / #136 CÓNCLAVE / #140 MURALLA: presente/enganchado/absorbiendo ≠ replegándose-de-verdad)
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coFlee && window.__dev.coTank && window.__dev.coSupport && window.__dev.coKill && window.__dev.coPresence && window.__dev.coStrike && window.__dev.partyVital && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coFlee + peer hooks (coTank/coSupport/coKill/coPresence/coStrike/partyVital) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.coFlee());
  ok("2 byte-id OFF (fresh boot): CO_FLEE_SURGE.enabled false AND G.coFleeBounty NUNCA se crea (gExists false) AND G._coFleeParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.flee === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coFleeFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} flee=${dark.flee} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiFlee=${dark.hiFlee} midFlee=${dark.midFlee} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no coFleeFind/coFleeBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coFleeFind|coFleeBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coFleeBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'coFleeFind'/'coFleeBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coFlee({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coFlee({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ fleeProbe LUT: (breaking,players)→D=clamp→banda(D vs {2,3} ENTEROS)→tier→charge (UMBRALES hiFlee/midFlee + colapso single-player + clamp).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coFlee({ fleeProbe: { breaking: c.breaking, players: c.players } }).fleeProbe), EXPECT_FLEE);
  const tabOK = EXPECT_FLEE.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].flee === c.D);
  ok("5 ★ fleeProbe LUT (REPLIEGUE D=#kiters replegándose): solo-P1(D1)⇒0, duo(D2)⇒1, duo-of-4(D2)⇒1, trio(D3)⇒2, trio-of-4(D3)⇒2, full(D4)⇒2, none-P3(D0)⇒0, one-flee-P3(D1)⇒0, clamp-overflow⇒D3. UMBRAL hiFlee 3/midFlee 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_FLEE[i].name, p: x.players, D: x.flee, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH REPLIEGUE: driveFlee inyecta roster sintético (posiciones + vivo/muerto + disengage) ⇒ D REAL server-auth (filtra fuera-de-radio + muertos + NO-kiters).
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z } = args;
    const mkParty = (rows) => rows.map((r) => ({ dx: r[0], dy: r[1], dead: !!r[2], flee: !!r[3] }));
    window.__dev.coFlee({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coFlee({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coFlee({ driveFlee: { players: mkParty(c.players), wipe: true } }).driveFlee;
      const live = window.__dev.coFlee({ fleeProbeLive: true }).fleeProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvFlee: dv.flee, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveFlee: live.flee, livePlayers: live.players });
    }
    window.__dev.coFlee({ clearFlee: true });
    window.__dev.coFlee({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvFlee === c.D && comp[i].liveFlee === c.D);
  ok("5c ★ REAL SERVER-AUTH REPLIEGUE (disengage snapshot): duo-flee(D2)=w1, solo(D1)=w0, trio(D3)=w2, far-excluded(dx9999⇒D2)=w1, dead-excluded(D2)=w1, present-not-fleeing(flee:false⇒D2)=w1 (filtra RADIO + muertos + NO-kiters)",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#140 MURALLA (KITE/DISENGAGE ⊥ damage-intake/ABSORBER): REPLIEGUE cuenta KITERS (se alejan), MURALLA cuenta ABSORBEDORES (comen el golpe). EVITAR-el-golpe ⊥ TOMAR-el-golpe.
  const cruxTank = await page.evaluate(() => {
    const flee = (breaking, P) => window.__dev.coFlee({ fleeProbe: { breaking, players: P } }).fleeProbe;
    const brunt = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    // {2 absorbiendo/plantados, 0 replegándose}: MURALLA T2/w1 pero REPLIEGUE D0/w0 (comen el tick, no se mueven)
    const A = { flee: flee(0, 3), brunt: brunt(2, 3) };
    // {0 absorbiendo, 3 replegándose}: MURALLA T0/w0 pero REPLIEGUE D3/w2 (kitean ilesos, evitan el siguiente)
    const B = { flee: flee(3, 3), brunt: brunt(0, 3) };
    return { A, B };
  });
  const cruxTankOK =
    cruxTank.A.brunt.tank === 2 && cruxTank.A.brunt.weight === 1 && cruxTank.A.flee.flee === 0 && cruxTank.A.flee.weight === 0
    && cruxTank.B.brunt.tank === 0 && cruxTank.B.brunt.weight === 0 && cruxTank.B.flee.flee === 3 && cruxTank.B.flee.weight === 2;
  ok("6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#140 MURALLA (EVITAR ⊥ TOMAR el golpe): {2 absorbiendo/plantados,0 replegándose} ⇒ MURALLA T2/w1 pero REPLIEGUE D0/w0; {0 absorbiendo,3 replegándose} ⇒ MURALLA T0/w0 pero REPLIEGUE D3/w2 ⇒ ABSORBER-el-golpe ⊥ REPLEGARSE-para-evitarlo (pesos divergen en AMBOS sentidos)",
     cruxTankOK, JSON.stringify(cruxTank));

  // 6b ★ CRUX ⊥#136 CÓNCLAVE (DISENGAGE ⊥ ENGANCHADOS/aggro'd): REPLIEGUE cuenta KITERS, CÓNCLAVE cuenta ENGANCHADOS. aggro'd-y-plantado ⊥ aggro'd-y-kiteando.
  const cruxCon = await page.evaluate(() => {
    const flee = (breaking, P) => window.__dev.coFlee({ fleeProbe: { breaking, players: P } }).fleeProbe;
    const muster = (tgts, P) => window.__dev.coStrike({ musterProbe: { tgts, players: P } }).musterProbe;
    // {2 enganchados, 0 replegándose (se plantan)}: CÓNCLAVE F2/w1 pero REPLIEGUE D0/w0
    const A = { flee: flee(0, 2), muster: muster([0, 1], 2) };
    // {refriega mínima/sin muster (1 mob ⇒ CÓNCLAVE gated 0), 2 replegándose}: CÓNCLAVE w0 pero REPLIEGUE D2/w1
    const B = { flee: flee(2, 2), muster: muster([0], 2) };
    return { A, B };
  });
  const cruxConOK =
    cruxCon.A.muster.muster === 2 && cruxCon.A.muster.weight === 1 && cruxCon.A.flee.flee === 0 && cruxCon.A.flee.weight === 0
    && cruxCon.B.muster.weight === 0 && cruxCon.B.flee.flee === 2 && cruxCon.B.flee.weight === 1;
  ok("6b ★ CRUX ⊥#136 CÓNCLAVE (DISENGAGE ⊥ ENGANCHADOS/aggro'd): {2 enganchados,0 replegándose} ⇒ CÓNCLAVE F2/w1 pero REPLIEGUE D0/w0 (aggro'd pero plantado); {refriega sin muster (CÓNCLAVE w0),2 replegándose} ⇒ REPLIEGUE D2/w1 (kite sin importar el muster) ⇒ estar-aggro'd ⊥ disengaging (pesos divergen en AMBOS sentidos)",
     cruxConOK, JSON.stringify(cruxCon));

  // 6c ★ CRUX ⊥#139 SOCORRO (REPLEGARSE ⊥ SOSTENER/heal): REPLIEGUE cuenta KITERS, SOCORRO cuenta SOCORREDORES.
  const cruxSup = await page.evaluate(() => {
    const flee = (breaking, P) => window.__dev.coFlee({ fleeProbe: { breaking, players: P } }).fleeProbe;
    const aid = (supporting, P) => window.__dev.coSupport({ aidProbe: { supporting, players: P } }).aidProbe;
    // {2 replegándose, 0 sanando}: REPLIEGUE D2/w1 pero SOCORRO S0/w0 (kiters se retiran, 0 heals)
    const A = { flee: flee(2, 3), aid: aid(0, 3) };
    // {0 replegándose, 3 sanando}: REPLIEGUE D0/w0 pero SOCORRO S3/w2 (sanadores plantados, 0 retirada)
    const B = { flee: flee(0, 3), aid: aid(3, 3) };
    return { A, B };
  });
  const cruxSupOK =
    cruxSup.A.flee.flee === 2 && cruxSup.A.flee.weight === 1 && cruxSup.A.aid.aid === 0 && cruxSup.A.aid.weight === 0
    && cruxSup.B.flee.flee === 0 && cruxSup.B.flee.weight === 0 && cruxSup.B.aid.aid === 3 && cruxSup.B.aid.weight === 2;
  ok("6c ★ CRUX ⊥#139 SOCORRO (REPLEGARSE ⊥ SOSTENER): {2 replegándose,0 sanando} ⇒ REPLIEGUE D2/w1 pero SOCORRO S0/w0; {0 replegándose,3 sanando} ⇒ REPLIEGUE D0/w0 pero SOCORRO S3/w2 ⇒ REPOSICIONARSE ⊥ APLICAR-heals (pesos divergen en AMBOS sentidos)",
     cruxSupOK, JSON.stringify(cruxSup));

  // 6d ★ CRUX ⊥#137 COHORTE (REPLEGARSE ⊥ PRESENTES): REPLIEGUE cuenta KITERS, COHORTE cuenta PRESENTES.
  const cruxPres = await page.evaluate(() => {
    const flee = (breaking, P) => window.__dev.coFlee({ fleeProbe: { breaking, players: P } }).fleeProbe;
    const pres = (present, P) => window.__dev.coPresence({ rosterProbe: { present, players: P } }).rosterProbe;
    // {4 presentes, 0 replegándose}: COHORTE R4/w2 vs REPLIEGUE D0/w0 (party llena presente pero nadie se mueve)
    const A = { flee: flee(0, 4), pres: pres(4, 4) };
    // {2 presentes, 2 replegándose}: COHORTE R2/w1 y REPLIEGUE D2/w1
    const B = { flee: flee(2, 2), pres: pres(2, 2) };
    return { A, B };
  });
  const cruxPresOK =
    cruxPres.A.pres.rally === 4 && cruxPres.A.pres.weight === 2 && cruxPres.A.flee.flee === 0 && cruxPres.A.flee.weight === 0
    && cruxPres.B.pres.rally === 2 && cruxPres.B.pres.weight === 1 && cruxPres.B.flee.flee === 2 && cruxPres.B.flee.weight === 1;
  ok("6d ★ CRUX ⊥#137 COHORTE (REPLEGARSE ⊥ PRESENTES): {4 presentes,0 replegándose} ⇒ COHORTE R4/w2 pero REPLIEGUE D0/w0; {2 presentes,2 replegándose} ⇒ COHORTE R2/w1 y REPLIEGUE D2/w1 ⇒ PRESENTE ⊥ DISENGAGING",
     cruxPresOK, JSON.stringify(cruxPres));

  // 6e ★ CRUX ⊥#132 PARTY_VITAL (ACCIÓN ⊥ ESTADO-de-HP): REPLIEGUE = CONTEO de quién se repliegó ESTE frame; TEMPLE = FRACCIÓN-de-HP MEDIA (cómo de sana ESTÁ la party). Divergen en AMBOS sentidos.
  const cruxVital = await page.evaluate(() => {
    const flee = (breaking, P) => window.__dev.coFlee({ fleeProbe: { breaking, players: P } }).fleeProbe;
    const vital = (fracs, mobs) => window.__dev.partyVital({ vitalProbe: { fracs, mobs, hpMax: 1000 } }).vitalProbe;
    // {party full-HP, NADIE replegándose este frame}: TEMPLE W1.0/w2 (sana) pero REPLIEGUE D0/w0 (nadie se movió)
    const A = { flee: flee(0, 3), vital: vital([1, 1, 1], 3) };
    // {party maltrecha 20%, 3 replegándose este frame}: TEMPLE W0.2/w0 (moribunda) pero REPLIEGUE D3/w2 (3 kitean AHORA)
    const B = { flee: flee(3, 3), vital: vital([0.2, 0.2, 0.2], 3) };
    return { A, B };
  });
  const cruxVitalOK =
    cruxVital.A.vital.weight === 2 && cruxVital.A.vital.vital >= 0.99 && cruxVital.A.flee.flee === 0 && cruxVital.A.flee.weight === 0
    && cruxVital.B.vital.weight === 0 && cruxVital.B.vital.vital <= 0.3 && cruxVital.B.flee.flee === 3 && cruxVital.B.flee.weight === 2;
  ok("6e ★ CRUX ⊥#132 PARTY_VITAL (ACCIÓN ⊥ ESTADO-de-HP): {party full-HP,nadie replegándose} ⇒ TEMPLE W1.0/w2 pero REPLIEGUE D0/w0; {party 20%HP,3 replegándose} ⇒ TEMPLE W0.2/w0 pero REPLIEGUE D3/w2 ⇒ ESTADO-de-HP (float MEDIO, PASIVO) ⊥ CONTEO-de-quién-se-repliegó (entero, ACCIÓN), diverge en AMBOS sentidos",
     cruxVitalOK, JSON.stringify(cruxVital));

  // 6f ★ CRUX ⊥#123 CONTEST (CONTEO CRUDO ⊥ FRACCIÓN cov/P): mismo D con distinta cobertura.
  const cruxContest = await page.evaluate(() => {
    const flee = (breaking, P) => window.__dev.coFlee({ fleeProbe: { breaking, players: P } }).fleeProbe;
    const full = flee(2, 2);   // 2 de 2: D2, cobertura 1.0
    const half = flee(2, 4);   // 2 de 4: MISMO D2, pero cobertura 0.5
    return { full, half };
  });
  const cruxContestOK = cruxContest.full.flee === 2 && cruxContest.half.flee === 2 && cruxContest.full.weight === 1 && cruxContest.half.weight === 1;
  ok("6f ★ CRUX ⊥#123 CONTEST (CONTEO ⊥ FRACCIÓN): {2 de 2}(cov 1.0) vs {2 de 4}(cov 0.5) ⇒ MISMO REPLIEGUE D2/w1 (conteo CRUDO de kiters, INVARIANTE a la cobertura fraccional)",
     cruxContestOK, JSON.stringify(cruxContest));

  // 7 ★ D-SENSITIVITY: más kiters DENTRO del radio ⇒ D sube.
  const dSens = await page.evaluate(() => {
    const t = (breaking, P) => { const m = window.__dev.coFlee({ fleeProbe: { breaking, players: P } }).fleeProbe; return { D: m.flee, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), full: t(4, 4) };
  });
  const dSensOK = dSens.duo.D === 2 && dSens.trio.D === 3 && dSens.full.D === 4 && dSens.duo.w === 1 && dSens.trio.w === 2 && dSens.full.w === 2;
  ok("7 ★ D-SENSITIVITY (D sube con más kiters replegándose): 2⇒D2/w1, 3⇒D3/w2, 4⇒D4/w2 (REPLIEGUE mide el tamaño CRUDO de la línea que se repliega)",
     dSensOK, JSON.stringify(dSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: SIN línea de kiters (D=1) ⇒ 0; CON línea (D≥2) ⇒ >0.
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coFlee({ enabled: true });
    const drive = (rows) => { window.__dev.coFlee({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coFlee({ driveFlee: { players: rows.map(r => ({ dx: r[0], dy: r[1], flee: true })), wipe: true } }).driveFlee;
      const live = window.__dev.coFlee({ fleeProbeLive: true }).fleeProbeLive;
      return { idx: dv.idx, flee: dv.flee, score: dv.score, players: live.players }; };
    const sp = drive([[0, 0]]);                        // single kiter: D=1 ⇒ 0 (colapso)
    const mp = drive([[0, 0], [44, 0], [0, 44]]);      // línea D3 ⇒ score2 (bien-definido)
    window.__dev.coFlee({ clearFlee: true });
    window.__dev.coFlee({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.flee === 1 && degen.sp.score === 0 && degen.mp.flee === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 kiter ⇒ D1/score0; 3 kiters ⇒ D3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE co-kitear en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM: dos fleeProbe idénticos ⇒ D/w byte-idénticos (conteo ENTERO + banda de umbrales enteros {2,3}, 0-float en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.coFlee({ fleeProbe: { breaking: 3, players: 4 } }).fleeProbe;
    const b = window.__dev.coFlee({ fleeProbe: { breaking: 3, players: 4 } }).fleeProbe;
    return { a: { D: a.flee, w: a.weight }, b: { D: b.flee, w: b.weight } };
  });
  const detOK = det.a.D === det.b.D && det.a.w === det.b.w && det.a.D === 3;
  ok("9 ★ INTEGER-DETERMINISM: fleeProbe repetido ⇒ D/weight byte-idénticos (CONTEO ENTERO de kiters + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 10 CANAL coFleeFind: forageChargePreview con co-flee acreditado >0 ; solitario → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coFlee({ enabled: true });
    window.__dev.coFlee({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coFlee({ driveFlee: { players: [{ dx: 0, dy: 0, flee: true }, { dx: 44, dy: 0, flee: true }, { dx: 0, dy: 44, flee: true }], wipe: true } });   // repliegue-pleno ⇒ score2
    const actVm = window.__dev.coFlee();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coFlee({ driveFlee: { players: [{ dx: 0, dy: 0, flee: true }], wipe: true } });   // solitario (D1) ⇒ score0
    const goVm = window.__dev.coFlee();
    window.__dev.coFlee({ clearFlee: true });
    window.__dev.coFlee({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coFleeFind: forageChargePreview repliegue pleno (D≥3) ⇒ charge>0 (==coFleeBonus); con solitario (D1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds coFleeBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 3; s <= 10; s++) vals.push(window.__dev.coFlee({ fleeProbe: { breaking: s, players: s } }).fleeProbe.charge);  // D=s ⇒ w2
    return { max: Math.max(...vals), cap: window.__dev.coFlee().cap };
  });
  ok("11 ★ SUB-CAP: ninguna carga plena produce charge>coFleeBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full co-flee available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coFlee({ enabled: true });
    window.__dev.coFlee({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coFlee({ driveFlee: { players: [{ dx: 0, dy: 0, flee: true }, { dx: 44, dy: 0, flee: true }, { dx: 0, dy: 44, flee: true }], wipe: true } });   // repliegue-pleno disponible
    window.__dev.coFlee({ enabled: false });                          // now OFF
    const off = window.__dev.coFlee();
    window.__dev.coFlee({ enabled: true }); window.__dev.coFlee({ clearFlee: true }); window.__dev.coFlee({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, flee: off.flee };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.flee === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, coFleeBonus(repliegue pleno disponible)==0 + forageChargePreview==0 + idx==0 + flee==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling coTank/coSupport/coKill/coPresence/partyVital no cambia la señal de coFlee.
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coFlee({ enabled: true });
    window.__dev.coFlee({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coFlee({ driveFlee: { players: [{ dx: 0, dy: 0, flee: true }, { dx: 44, dy: 0, flee: true }, { dx: 0, dy: 44, flee: true }], wipe: true } }).driveFlee;
    const snap = () => JSON.stringify({ coTank: window.__dev.coTank(), coSupport: window.__dev.coSupport(), coKill: window.__dev.coKill(), coPresence: window.__dev.coPresence(), partyVital: window.__dev.partyVital() });
    const peersOn = snap();
    const ctPrev = window.__dev.coTank().enabled, csPrev = window.__dev.coSupport().enabled, ckPrev = window.__dev.coKill().enabled, cpPrev = window.__dev.coPresence().enabled, pvPrev = window.__dev.partyVital().enabled;
    window.__dev.coTank({ enabled: !ctPrev }); window.__dev.coSupport({ enabled: !csPrev }); window.__dev.coKill({ enabled: !ckPrev }); window.__dev.coPresence({ enabled: !cpPrev }); window.__dev.partyVital({ enabled: !pvPrev });
    const after = window.__dev.coFlee({ fleeProbeLive: true }).fleeProbeLive;
    window.__dev.coTank({ enabled: ctPrev }); window.__dev.coSupport({ enabled: csPrev }); window.__dev.coKill({ enabled: ckPrev }); window.__dev.coPresence({ enabled: cpPrev }); window.__dev.partyVital({ enabled: pvPrev });
    const peersRestored = snap();
    window.__dev.coFlee({ clearFlee: true });
    window.__dev.coFlee({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.flee === after.flee;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeFlee: before.flee, afterFlee: after.flee };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD coFleeFind ⊥ peers: la señal de co-flee (score/flee) NO cambia al togglear CO-TANK #140/CO-SUPPORT #139/CO-KILL #138/CO-PRESENCE #137/PARTY-VITAL #132; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION CENSUS: served config — 69 `_SURGE` totales, sole-false = CO_FLEE (68 true, incl. CO_TANK #140 LIVE).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coTankLive = census.find(([n]) => n === "CO_TANK_SURGE");
  const censusOK = total === 69 && trues === 68 && falses.length === 1 && falses[0] === "CO_FLEE_SURGE" && coTankLive && coTankLive[1] === "true";
  ok("14 ★ 0-REGRESIÓN CENSUS: served config 69 `_SURGE` totales, 68 enabled:true (incl. CO_TANK_SURGE #140 LIVE), sole-false = CO_FLEE_SURGE (DARK #141)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coTank=${coTankLive ? coTankLive[1] : "?"}`);

  // 15 render badge "Repliegue:" drawn ON+co-flee / not OFF + fps. 🔑 label ÚNICO "Repliegue:" (⊥ #140 'Muralla:'/#139 'Socorro:'/#138 'Cuadrilla:'/#137 'Cohorte:'/#136 'Cónclave:').
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const drive = () => window.__dev.coFlee({ driveFlee: { players: [{ dx: 0, dy: 0, flee: true }, { dx: 44, dy: 0, flee: true }, { dx: 0, dy: 44, flee: true }], wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Repliegue:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coFlee({ enabled: true });
    window.__dev.coFlee({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coFlee({ clearFlee: true });
    window.__dev.coFlee({ enabled: false });
    const enAtOff = window.__dev.coFlee().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z });
  ok("15 render badge \"Repliegue:\" se DIBUJA ON+co-flee (D>0, re-driven cada frame) y NO OFF (D 0) + fps sano (label ÚNICO ⊥ #140 'Muralla:'/#139 'Socorro:'/#138 'Cuadrilla:'/#137 'Cohorte:'/#136 'Cónclave:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.coFlee({ enabled: true }); window.__dev.coFlee({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coFlee({ driveFlee: { players: [{ dx: 0, dy: 0, flee: true }, { dx: 44, dy: 0, flee: true }, { dx: 0, dy: 44, flee: true }], wipe: true } }); }, { Z });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coFlee({ clearFlee: true }); window.__dev.coFlee({ enabled: false }); });

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
    window.__dev.coFlee({ enabled: true });
    window.__dev.coFlee({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coFlee({ driveFlee: { players: [{ dx: 0, dy: 0, flee: true }, { dx: 44, dy: 0, flee: true }, { dx: 0, dy: 44, flee: true }], wipe: true } }).driveFlee;   // D=3 ⇒ score2
    const vm = window.__dev.coFlee();
    const lut = [[2, 2], [3, 3], [1, 1], [4, 4]].map(([breaking, P]) => { const m = window.__dev.coFlee({ fleeProbe: { breaking, players: P } }).fleeProbe; return { p: m.players, D: m.flee, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coFlee({ fleeProbeLive: true }).fleeProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coFlee({ clearFlee: true });
    window.__dev.coFlee({ enabled: false });
    return { score: dv.score, idx: dv.idx, flee: dv.flee, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveFlee: live.flee, livePlayers: live.players, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.flee === B.flee && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveFlee === B.liveFlee && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMO disengage D=3 ⇒ score/idx/flee/players/tier/charge + fleeProbeLive(field,flee,players,score) + fleeProbe LUT (D enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},flee:${A.flee},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveFlee:${A.liveFlee},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},flee:${B.flee},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveFlee:${B.liveFlee},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.coFlee({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coFlee({ enabled: false }));

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
