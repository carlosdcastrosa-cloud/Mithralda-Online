// CAS-2810 — POST-FLIP LIVE QA for SOCORRO (CO_SUPPORT_SURGE.enabled:TRUE LIVE, EVO#139, 81º flag). Base master 3b77140 (a7931d8 DARK → 2c3aba5 flip false→true → 3b77140 version stamp 5f4a11037d5f/815), served LIVE carlosdcastrosa-cloud.github.io/Mithralda-Online.
// Derivado del DARK self-verify cas2807 con: ck2 INVERTIDO LIVE-ON (enabled TRUE, solo boot ⇒ S≤1 ⇒ score/tier/charge colapsan LIMPIO), ck14 CENSUS INVERTIDO (67/67 enabled:true off=[]), + ck18 SERVED-LIVE-BUILD (root200 + version.json 5f4a11037d5f/815 + served config CO_SUPPORT_SURGE enabled:true + census 67/67). Gameplay/determinismo corre contra checkout local NO-DRIFT (HEAD==origin==3b77140, byte-idéntico a lo servido); ck18 verifica los BYTES SERVIDOS.
// (A) EJE FRESCO = SOCORRO/CO-SUPPORT = S = nº de JUGADORES DISTINTOS VIVOS que APLICARON un socorro (heal/shield/buff/revive) a un aliado (support-credit) DENTRO DEL RADIO COMPARTIDO del héroe (ENABLER — quién SOSTIENE), ⊥ #138 CUADRILLA (REMATAN) y ⊥ #137 COHORTE (PRESENTES) y ⊥ #136 CÓNCLAVE (ENGANCHADOS) y ⊥ #132 PARTY_VITAL (fracción-de-HP MEDIA = ESTADO). CONTEO CRUDO de socorredores acreditados, NO fracción (#123 cov/P). SNAPSHOT PURO (lee el support-credit ya replicado, SIN buffer temporal). 🔑 DETERMINISMO (sev-1): S=cuenta ENTERA de socorredores acreditados vs umbrales ENTEROS {midSuccor2,hiSuccor3} ⇒ 0-float en el score/decisión. Bandas sobre S: ≥hiSuccor(3) ⇒ socorro-pleno ⇒ 2; ≥midSuccor(2) ⇒ socorro-parcial ⇒ 1; <2 (solitario) ⇒ 0. 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ el héroe NO socorre a nadie ⇒ S=0 ⇒ 0 (colapso LIMPIO, IMPOSIBLE en solitario).
// (B) CANAL FRESCO = coSupportFind (fichas de socorro por rematar con el socorro ACREDITADO — NINGUNO de los 80 flags #59-#138 lo usa). Moneda FRESCA (h.coSupportBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — SOCORRO = ENABLER/SUCCOR (quién SOSTIENE) ⊥ TODOS los priores: ⊥#138 CUADRILLA (REMATAN): {2 sanando,1 rematando} ⇒ SOCORRO S2/w1 pero CUADRILLA K1/w0; {1 sanando,3 rematando} ⇒ SOCORRO S1/w0 pero CUADRILLA K3/w2 (diverge en AMBOS sentidos); ⊥#137 COHORTE (PRESENTES): {4 presentes,0 sanando} ⇒ COHORTE R4/w2 pero SOCORRO S0/w0; ⊥#136 CÓNCLAVE (ENGANCHADOS): estar aggro'd ⊥ socorrer; ⊥#132 PARTY_VITAL (ESTADO-de-HP): {party full-HP, nadie sanando} ⇒ TEMPLE W1.0/w2 pero SOCORRO S0/w0; {party maltrecha, 3 sanando} ⇒ TEMPLE W0.2/w0 pero SOCORRO S3/w2 (ESTADO ⊥ ACCIÓN, diverge en AMBOS sentidos).
//
// Run: node tools/cas2810-cosupport-live-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE_BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2810");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// aidProbe LUT esperada: (supporting=nº socorredores acreditados en radio, players=P gate)→S=clamp(supporting,0,P)→banda(S vs {midSuccor2,hiSuccor3,minPlayers2} ENTEROS)→{weight,rankTier}. UMBRALES hiSuccor 3 / midSuccor 2 + colapso single-player (S<minPlayers2 ⇒ 0).
const EXPECT_AID = [
  { name: "solo-P1",            supporting: 1, players: 1, S: 1, w: 0 },   // single-player: S1<midSuccor ⇒ 0 (colapso LIMPIO)
  { name: "duo-P2",             supporting: 2, players: 2, S: 2, w: 1 },   // 2 socorredores ⇒ S2 ⇒ 1
  { name: "duo-of-4",           supporting: 2, players: 4, S: 2, w: 1 },   // 🔑 2 socorredores DE un roster de 4 ⇒ S2 (conteo CRUDO, ⊥ CONTEST fracción 2/4)
  { name: "trio-P3",            supporting: 3, players: 3, S: 3, w: 2 },   // 3 socorredores ⇒ S3 ⇒ 2
  { name: "trio-of-4",          supporting: 3, players: 4, S: 3, w: 2 },   // S3 de P4 ⇒ 2
  { name: "full-P4",            supporting: 4, players: 4, S: 4, w: 2 },   // 4 socorredores ⇒ S4 ⇒ 2
  { name: "none-P3",            supporting: 0, players: 3, S: 0, w: 0 },   // 🔑 NADIE socorrió (todos presentes pero 0 heals) ⇒ S0 ⇒ 0 (⊥ COHORTE presentes)
  { name: "one-support-P3",     supporting: 1, players: 3, S: 1, w: 0 },   // sólo 1 socorrió de un roster de 3 ⇒ S1 ⇒ 0
  { name: "clamp-overflow",     supporting: 9, players: 3, S: 3, w: 2 },   // supporting>P se clampa a P=3 ⇒ S3 ⇒ 2
];
// driveAid REAL: inyecta roster sintético (P jugadores con offset {dx,dy}, opcional dead/support) ⇒ S server-auth = # SOCORREDORES (support=true) VIVOS DENTRO del radio. Requiere ≥minPlayers(2) socorredores para banda.
// filas: [dx, dy, dead, support]
const EXPECT_DRIVE = [
  { name: "duo-support",        players: [[0, 0, false, true], [44, 0, false, true]],                        S: 2, w: 1 },   // 2 socorredores en radio ⇒ S2
  { name: "solo-support",       players: [[0, 0, false, true]],                                              S: 1, w: 0 },   // 1 ⇒ S1 ⇒ 0
  { name: "trio-support",       players: [[0, 0, false, true], [44, 0, false, true], [0, 44, false, true]],  S: 3, w: 2 },  // 3 ⇒ S3 ⇒ 2
  { name: "far-excluded",       players: [[0, 0, false, true], [44, 0, false, true], [9999, 0, false, true]], S: 2, w: 1 },// 🔑 3º socorredor fuera de radio (dx 9999) ⇒ EXCLUIDO ⇒ S2 (RADIO-LOCAL)
  { name: "dead-excluded",      players: [[0, 0, false, true], [44, 0, false, true], [30, 30, true, true]],  S: 2, w: 1 },  // 🔑 3º socorredor MUERTO ⇒ EXCLUIDO ⇒ S2 (ANTI-conteo-de-cadáveres)
  { name: "present-not-supporting", players: [[0, 0, false, true], [44, 0, false, true], [30, 30, false, false]], S: 2, w: 1 }, // 🔑 3º PRESENTE en radio pero SIN support-credit (support:false) ⇒ EXCLUIDO ⇒ S2 (⊥ #137 COHORTE / #138 CUADRILLA: presente/rematando ≠ acreditado-con-socorro)
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coSupport && window.__dev.coKill && window.__dev.coPresence && window.__dev.coStrike && window.__dev.partyVital && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coSupport + peer hooks (coKill/coPresence/coStrike/partyVital) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE-ON fresh boot (INVERTED from DARK): CO_SUPPORT_SURGE.enabled TRUE; solo hero fresh boot, sin socorro acreditado en radio ⇒ S≤1 < midSuccor2 ⇒ el SCORE/DECISIÓN colapsan LIMPIO (tier/score/aid/charge/preview=0, se ilumina sólo con ≥2 socorredores acreditados). Multijugador-nativo: IMPOSIBLE dispararse en solitario. channel fresco coSupportFind + tag vacío. 🔑 NO asertamos gExists/partyExists (con enabled:true las estructuras transitorias PUEDEN materializarse — aserta el COLAPSO DE DECISIÓN, no la existencia).
  const dark = await page.evaluate(() => window.__dev.coSupport());
  ok("2 LIVE-ON (fresh solo boot): CO_SUPPORT_SURGE.enabled TRUE AND sin banco de socorro acreditado (S≤1) ⇒ score/tier/aid/charge/preview colapsan LIMPIO a 0 AND channel coSupportFind AND tag vacío",
     dark.enabled === true && dark.tier === 0 && dark.score === 0 && dark.aid <= 1 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coSupportFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} aid=${dark.aid} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiSuccor=${dark.hiSuccor} midSuccor=${dark.midSuccor} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no coSupportFind/coSupportBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coSupportFind|coSupportBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coSupportBounty"\s*:/.test(saveOff);
  ok("3 byte-id save: sin clave 'coSupportFind'/'coSupportBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coSupport({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coSupport({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ aidProbe LUT: (supporting,players)→S=clamp→banda(S vs {2,3} ENTEROS)→tier→charge (UMBRALES hiSuccor/midSuccor + colapso single-player + clamp).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coSupport({ aidProbe: { supporting: c.supporting, players: c.players } }).aidProbe), EXPECT_AID);
  const tabOK = EXPECT_AID.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].aid === c.S);
  ok("5 ★ aidProbe LUT (SOCORRO S=#socorredores acreditados): solo-P1(S1)⇒0, duo(S2)⇒1, duo-of-4(S2)⇒1, trio(S3)⇒2, trio-of-4(S3)⇒2, full(S4)⇒2, none-P3(S0)⇒0, one-support-P3(S1)⇒0, clamp-overflow⇒S3. UMBRAL hiSuccor 3/midSuccor 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_AID[i].name, p: x.players, S: x.aid, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH SOCORRO: driveAid inyecta roster sintético (posiciones + vivo/muerto + support-credit) ⇒ S REAL server-auth (filtra fuera-de-radio + muertos + NO-socorredores).
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z } = args;
    const mkParty = (rows) => rows.map((r) => ({ dx: r[0], dy: r[1], dead: !!r[2], support: !!r[3] }));
    window.__dev.coSupport({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coSupport({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coSupport({ driveAid: { players: mkParty(c.players), wipe: true } }).driveAid;
      const live = window.__dev.coSupport({ aidProbeLive: true }).aidProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvAid: dv.aid, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveAid: live.aid, livePlayers: live.players });
    }
    window.__dev.coSupport({ clearAid: true });
    window.__dev.coSupport({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvAid === c.S && comp[i].liveAid === c.S);
  ok("5c ★ REAL SERVER-AUTH SOCORRO (support-credit snapshot): duo-support(S2)=w1, solo(S1)=w0, trio(S3)=w2, far-excluded(dx9999⇒S2)=w1, dead-excluded(S2)=w1, present-not-supporting(support:false⇒S2)=w1 (filtra RADIO + muertos + NO-socorredores)",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA) ⊥#138 CUADRILLA (SUCCOR ⊥ CO-KILL): SOCORRO cuenta SOCORREDORES, CUADRILLA cuenta KILLERS acreditados.
  const cruxKill = await page.evaluate(() => {
    const aid = (supporting, P) => window.__dev.coSupport({ aidProbe: { supporting, players: P } }).aidProbe;
    const kill = (credited, P) => window.__dev.coKill({ hitProbe: { credited, players: P } }).hitProbe;
    const A = { aid: aid(2, 3), kill: kill(1, 3) };
    const B = { aid: aid(1, 3), kill: kill(3, 3) };
    return { A, B };
  });
  const cruxKillOK =
    cruxKill.A.aid.aid === 2 && cruxKill.A.aid.weight === 1 && cruxKill.A.kill.assist === 1 && cruxKill.A.kill.weight === 0
    && cruxKill.B.aid.aid === 1 && cruxKill.B.aid.weight === 0 && cruxKill.B.kill.assist === 3 && cruxKill.B.kill.weight === 2;
  ok("6 ★ CRUX (LA CRÍTICA) ⊥#138 CUADRILLA (SUCCOR ⊥ CO-KILL): {2 sanando,1 rematando} ⇒ SOCORRO S2/w1 pero CUADRILLA K1/w0 (sanadores 0-kills); {1 sanando,3 rematando} ⇒ SOCORRO S1/w0 pero CUADRILLA K3/w2 ⇒ habilitar-sostén ⊥ contribuir-remates (pesos divergen en AMBOS sentidos)",
     cruxKillOK, JSON.stringify(cruxKill));

  // 6b ★ CRUX ⊥#137 COHORTE (SUCCOR ⊥ PRESENTES): SOCORRO cuenta SOCORREDORES, COHORTE cuenta PRESENTES.
  const cruxPres = await page.evaluate(() => {
    const aid = (supporting, P) => window.__dev.coSupport({ aidProbe: { supporting, players: P } }).aidProbe;
    const pres = (present, P) => window.__dev.coPresence({ rosterProbe: { present, players: P } }).rosterProbe;
    const A = { aid: aid(0, 4), pres: pres(4, 4) };
    const B = { aid: aid(2, 2), pres: pres(2, 2) };
    return { A, B };
  });
  const cruxPresOK =
    cruxPres.A.pres.rally === 4 && cruxPres.A.pres.weight === 2 && cruxPres.A.aid.aid === 0 && cruxPres.A.aid.weight === 0
    && cruxPres.B.pres.rally === 2 && cruxPres.B.pres.weight === 1 && cruxPres.B.aid.aid === 2 && cruxPres.B.aid.weight === 1;
  ok("6b ★ CRUX ⊥#137 COHORTE (SUCCOR ⊥ PRESENTES): {4 presentes,0 sanando} ⇒ COHORTE R4/w2 pero SOCORRO S0/w0 (party presente que NO socorre); {2 presentes,2 sanando} ⇒ COHORTE R2/w1 y SOCORRO S2/w1 ⇒ PRESENTE ⊥ APOYAR (SOCORRO es el eje de ENABLER/SUCCOR, COHORTE el de CO-PRESENCIA)",
     cruxPresOK, JSON.stringify(cruxPres));

  // 6c ★ CRUX ⊥#136 CÓNCLAVE (SUCCOR ⊥ ENGANCHADOS): SOCORRO cuenta SOCORREDORES, CÓNCLAVE cuenta ENGANCHADOS por mob.
  const cruxCon = await page.evaluate(() => {
    const aid = (supporting, P) => window.__dev.coSupport({ aidProbe: { supporting, players: P } }).aidProbe;
    const muster = (tgts, P) => window.__dev.coStrike({ musterProbe: { tgts, players: P } }).musterProbe;
    const A = { aid: aid(0, 2), muster: muster([0, 1], 2) };
    const B = { aid: aid(2, 2), muster: muster([0], 2) };
    return { A, B };
  });
  const cruxConOK =
    cruxCon.A.muster.muster === 2 && cruxCon.A.muster.weight === 1 && cruxCon.A.aid.aid === 0 && cruxCon.A.aid.weight === 0
    && cruxCon.B.muster.weight === 0 && cruxCon.B.aid.aid === 2 && cruxCon.B.aid.weight === 1;
  ok("6c ★ CRUX ⊥#136 CÓNCLAVE (SUCCOR ⊥ ENGANCHADOS): {2 enganchados,0 sanando} ⇒ CÓNCLAVE F2/w1 pero SOCORRO S0/w0 (todos tanqueando, nadie socorre); {refriega sin muster (CÓNCLAVE w0),2 sanando} ⇒ SOCORRO S2/w1 ⇒ señal-ENGANCHADO ⊥ señal-SOSTENER (pesos divergen en AMBOS sentidos)",
     cruxConOK, JSON.stringify(cruxCon));

  // 6d ★ CRUX ⊥#132 PARTY_VITAL (ACCIÓN ⊥ ESTADO-de-HP): SOCORRO = CONTEO de quién ACTÚA para sostener; TEMPLE = FRACCIÓN-de-HP MEDIA (cómo de sana ESTÁ la party). Divergen en AMBOS sentidos.
  const cruxVital = await page.evaluate(() => {
    const aid = (supporting, P) => window.__dev.coSupport({ aidProbe: { supporting, players: P } }).aidProbe;
    const vital = (fracs, mobs) => window.__dev.partyVital({ vitalProbe: { fracs, mobs, hpMax: 1000 } }).vitalProbe;
    const A = { aid: aid(0, 3), vital: vital([1, 1, 1], 3) };
    const B = { aid: aid(3, 3), vital: vital([0.2, 0.2, 0.2], 3) };
    return { A, B };
  });
  const cruxVitalOK =
    cruxVital.A.vital.weight === 2 && cruxVital.A.vital.vital >= 0.99 && cruxVital.A.aid.aid === 0 && cruxVital.A.aid.weight === 0
    && cruxVital.B.vital.weight === 0 && cruxVital.B.vital.vital <= 0.3 && cruxVital.B.aid.aid === 3 && cruxVital.B.aid.weight === 2;
  ok("6d ★ CRUX ⊥#132 PARTY_VITAL (ACCIÓN ⊥ ESTADO-de-HP): {party full-HP,nadie sanando} ⇒ TEMPLE W1.0/w2 pero SOCORRO S0/w0; {party 20%HP,3 sanando} ⇒ TEMPLE W0.2/w0 pero SOCORRO S3/w2 ⇒ ESTADO-de-HP-de-la-party (float MEDIO, PASIVO) ⊥ CONTEO-de-quién-ACTÚA (entero, ACCIÓN), diverge en AMBOS sentidos",
     cruxVitalOK, JSON.stringify(cruxVital));

  // 6e ★ CRUX ⊥#123 CONTEST (CONTEO CRUDO ⊥ FRACCIÓN cov/P): mismo S con distinta cobertura.
  const cruxContest = await page.evaluate(() => {
    const aid = (supporting, P) => window.__dev.coSupport({ aidProbe: { supporting, players: P } }).aidProbe;
    const full = aid(2, 2);   // 2 de 2: S2, cobertura 1.0
    const half = aid(2, 4);   // 2 de 4: MISMO S2, pero cobertura 0.5
    return { full, half };
  });
  const cruxContestOK = cruxContest.full.aid === 2 && cruxContest.half.aid === 2 && cruxContest.full.weight === 1 && cruxContest.half.weight === 1;
  ok("6e ★ CRUX ⊥#123 CONTEST (CONTEO ⊥ FRACCIÓN): {2 de 2}(cov 1.0) vs {2 de 4}(cov 0.5) ⇒ MISMO SOCORRO S2/w1 (conteo CRUDO de socorredores, INVARIANTE a la cobertura fraccional)",
     cruxContestOK, JSON.stringify(cruxContest));

  // 7 ★ S-SENSITIVITY: más socorredores acreditados DENTRO del radio ⇒ S sube.
  const sSens = await page.evaluate(() => {
    const t = (supporting, P) => { const m = window.__dev.coSupport({ aidProbe: { supporting, players: P } }).aidProbe; return { S: m.aid, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), full: t(4, 4) };
  });
  const sSensOK = sSens.duo.S === 2 && sSens.trio.S === 3 && sSens.full.S === 4 && sSens.duo.w === 1 && sSens.trio.w === 2 && sSens.full.w === 2;
  ok("7 ★ S-SENSITIVITY (S sube con más socorredores ACREDITADOS): 2⇒S2/w1, 3⇒S3/w2, 4⇒S4/w2 (SOCORRO mide el tamaño CRUDO del banco de socorro acreditado)",
     sSensOK, JSON.stringify(sSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: SIN party de socorredores (S=1) ⇒ 0; CON banco (S≥2) ⇒ >0.
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coSupport({ enabled: true });
    const drive = (rows) => { window.__dev.coSupport({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coSupport({ driveAid: { players: rows.map(r => ({ dx: r[0], dy: r[1], support: true })), wipe: true } }).driveAid;
      const live = window.__dev.coSupport({ aidProbeLive: true }).aidProbeLive;
      return { idx: dv.idx, aid: dv.aid, score: dv.score, players: live.players }; };
    const sp = drive([[0, 0]]);                        // single socorredor: S=1 ⇒ 0 (colapso)
    const mp = drive([[0, 0], [44, 0], [0, 44]]);      // banco S3 ⇒ score2 (bien-definido)
    window.__dev.coSupport({ clearAid: true });
    window.__dev.coSupport({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.aid === 1 && degen.sp.score === 0 && degen.mp.aid === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 socorredor ⇒ S1/score0; 3 socorredores ⇒ S3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM: dos aidProbe idénticos ⇒ S/w byte-idénticos (conteo ENTERO + banda de umbrales enteros {2,3}, 0-float en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.coSupport({ aidProbe: { supporting: 3, players: 4 } }).aidProbe;
    const b = window.__dev.coSupport({ aidProbe: { supporting: 3, players: 4 } }).aidProbe;
    return { a: { S: a.aid, w: a.weight }, b: { S: b.aid, w: b.weight } };
  });
  const detOK = det.a.S === det.b.S && det.a.w === det.b.w && det.a.S === 3;
  ok("9 ★ INTEGER-DETERMINISM: aidProbe repetido ⇒ S/weight byte-idénticos (CONTEO ENTERO de socorredores + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 10 CANAL coSupportFind: forageChargePreview con socorro acreditado >0 ; solitario → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coSupport({ enabled: true });
    window.__dev.coSupport({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coSupport({ driveAid: { players: [{ dx: 0, dy: 0, support: true }, { dx: 44, dy: 0, support: true }, { dx: 0, dy: 44, support: true }], wipe: true } });   // socorro-pleno ⇒ score2
    const actVm = window.__dev.coSupport();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coSupport({ driveAid: { players: [{ dx: 0, dy: 0, support: true }], wipe: true } });   // solitario (S1) ⇒ score0
    const goVm = window.__dev.coSupport();
    window.__dev.coSupport({ clearAid: true });
    window.__dev.coSupport({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coSupportFind: forageChargePreview socorro pleno (S≥3) ⇒ charge>0 (==coSupportBonus); con solitario (S1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds coSupportBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 3; s <= 10; s++) vals.push(window.__dev.coSupport({ aidProbe: { supporting: s, players: s } }).aidProbe.charge);  // S=s ⇒ w2
    return { max: Math.max(...vals), cap: window.__dev.coSupport().cap };
  });
  ok("11 ★ SUB-CAP: ningún socorro pleno produce charge>coSupportBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full socorro available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coSupport({ enabled: true });
    window.__dev.coSupport({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coSupport({ driveAid: { players: [{ dx: 0, dy: 0, support: true }, { dx: 44, dy: 0, support: true }, { dx: 0, dy: 44, support: true }], wipe: true } });   // socorro-pleno disponible
    window.__dev.coSupport({ enabled: false });                          // now OFF
    const off = window.__dev.coSupport();
    window.__dev.coSupport({ enabled: true }); window.__dev.coSupport({ clearAid: true }); window.__dev.coSupport({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, aid: off.aid };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.aid === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, coSupportBonus(socorro pleno disponible)==0 + forageChargePreview==0 + idx==0 + aid==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling coKill/coPresence/partyVital no cambia la señal de coSupport.
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coSupport({ enabled: true });
    window.__dev.coSupport({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coSupport({ driveAid: { players: [{ dx: 0, dy: 0, support: true }, { dx: 44, dy: 0, support: true }, { dx: 0, dy: 44, support: true }], wipe: true } }).driveAid;
    const snap = () => JSON.stringify({ coKill: window.__dev.coKill(), coPresence: window.__dev.coPresence(), partyVital: window.__dev.partyVital() });
    const peersOn = snap();
    const ckPrev = window.__dev.coKill().enabled, cpPrev = window.__dev.coPresence().enabled, pvPrev = window.__dev.partyVital().enabled;
    window.__dev.coKill({ enabled: !ckPrev }); window.__dev.coPresence({ enabled: !cpPrev }); window.__dev.partyVital({ enabled: !pvPrev });
    const after = window.__dev.coSupport({ aidProbeLive: true }).aidProbeLive;
    window.__dev.coKill({ enabled: ckPrev }); window.__dev.coPresence({ enabled: cpPrev }); window.__dev.partyVital({ enabled: pvPrev });
    const peersRestored = snap();
    window.__dev.coSupport({ clearAid: true });
    window.__dev.coSupport({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.aid === after.aid;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeAid: before.aid, afterAid: after.aid };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD coSupportFind ⊥ peers: la señal de socorro (score/aid) NO cambia al togglear CO-KILL #138/CO-PRESENCE #137/PARTY-VITAL #132; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION CENSUS (INVERTED LIVE-ON): served config — 67 `_SURGE` totales, 67 enabled:true, off=[] (CO_SUPPORT_SURGE #139 LIVE + CO_KILL #138 LIVE + los 79 priores).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coKillLive = census.find(([n]) => n === "CO_KILL_SURGE");
  const coSupportLive = census.find(([n]) => n === "CO_SUPPORT_SURGE");
  const censusOK = total === 67 && trues === 67 && falses.length === 0 && coSupportLive && coSupportLive[1] === "true" && coKillLive && coKillLive[1] === "true";
  ok("14 ★ LIVE-ON 0-REGRESIÓN CENSUS (INVERTED): served config 67 `_SURGE` totales, 67 enabled:true, off=[] (CO_SUPPORT_SURGE #139 LIVE + CO_KILL_SURGE #138 LIVE + los 79 priores)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coSupport=${coSupportLive ? coSupportLive[1] : "?"} coKill=${coKillLive ? coKillLive[1] : "?"}`);

  // 15 render badge "Socorro:" drawn ON+socorro / not OFF + fps. 🔑 label ÚNICO "Socorro:" (⊥ #138 'Cuadrilla:'/#137 'Cohorte:'/#136 'Cónclave:').
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const drive = () => window.__dev.coSupport({ driveAid: { players: [{ dx: 0, dy: 0, support: true }, { dx: 44, dy: 0, support: true }, { dx: 0, dy: 44, support: true }], wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Socorro:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coSupport({ enabled: true });
    window.__dev.coSupport({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coSupport({ clearAid: true });
    window.__dev.coSupport({ enabled: false });
    const enAtOff = window.__dev.coSupport().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z });
  ok("15 render badge \"Socorro:\" se DIBUJA ON+socorro (S>0, re-driven cada frame) y NO OFF (S 0) + fps sano (label ÚNICO ⊥ #138 'Cuadrilla:'/#137 'Cohorte:'/#136 'Cónclave:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.coSupport({ enabled: true }); window.__dev.coSupport({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coSupport({ driveAid: { players: [{ dx: 0, dy: 0, support: true }, { dx: 44, dy: 0, support: true }, { dx: 0, dy: 44, support: true }], wipe: true } }); }, { Z });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coSupport({ clearAid: true }); window.__dev.coSupport({ enabled: false }); });

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
    window.__dev.coSupport({ enabled: true });
    window.__dev.coSupport({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coSupport({ driveAid: { players: [{ dx: 0, dy: 0, support: true }, { dx: 44, dy: 0, support: true }, { dx: 0, dy: 44, support: true }], wipe: true } }).driveAid;   // S=3 ⇒ score2
    const vm = window.__dev.coSupport();
    const lut = [[2, 2], [3, 3], [1, 1], [4, 4]].map(([supporting, P]) => { const m = window.__dev.coSupport({ aidProbe: { supporting, players: P } }).aidProbe; return { p: m.players, S: m.aid, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coSupport({ aidProbeLive: true }).aidProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coSupport({ clearAid: true });
    window.__dev.coSupport({ enabled: false });
    return { score: dv.score, idx: dv.idx, aid: dv.aid, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveAid: live.aid, livePlayers: live.players, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.aid === B.aid && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveAid === B.liveAid && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMO support-credit S=3 ⇒ score/idx/aid/players/tier/charge + aidProbeLive(field,aid,players,score) + aidProbe LUT (S enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},aid:${A.aid},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveAid:${A.liveAid},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},aid:${B.aid},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveAid:${B.liveAid},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.coSupport({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coSupport({ enabled: false }));

  // 18 ★ SERVED LIVE BUILD (gh-pages, no publish lag): root 200 + version.json == 5f4a11037d5f/815 (NEW ≠ old 9527556851d4) + served sim/config.js CO_SUPPORT_SURGE enabled:true + census 67/67 off=[].
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
    const lCoSupport = lcensus.find(([n]) => n === "CO_SUPPORT_SURGE");
    const servedOK = rootRes.status === 200 && ver.build === "5f4a11037d5f" && ver.files === 815 && lTotal === 67 && lTrues === 67 && lFalses.length === 0 && lCoSupport && lCoSupport[1] === "true";
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json 5f4a11037d5f/815 (NEW ≠ old 9527556851d4) + served sim/config.js CO_SUPPORT_SURGE enabled:true + census 67/67 off=[]",
       servedOK, `rootStatus=${rootRes.status} build=${ver.build} files=${ver.files} census total=${lTotal} true=${lTrues} false=${JSON.stringify(lFalses)} coSupport=${lCoSupport ? lCoSupport[1] : "?"}`);
  } catch (e) {
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json 5f4a11037d5f/815 + config CO_SUPPORT_SURGE enabled:true", false, `FETCH ERROR ${String(e)}`);
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
