// CAS-2806 — POST-FLIP LIVE QA for CUADRILLA (CO_KILL_SURGE.enabled:TRUE LIVE, EVO#138, 80º flag). Base master 16905d9 (e69a5a0 DARK → 2c37c08 flip false→true → 16905d9 version stamp 9527556851d4/815), served LIVE carlosdcastrosa-cloud.github.io/Mithralda-Online.
// Derivado del DARK self-verify cas2802 con: ck2 INVERTIDO LIVE-ON (enabled TRUE, solo boot ⇒ K≤1 ⇒ score/tier/charge colapsan LIMPIO), ck14 CENSUS INVERTIDO (66/66 enabled:true off=[]), + ck18 SERVED-LIVE-BUILD (root200 + version.json 9527556851d4/815 + served config CO_KILL_SURGE enabled:true + census 66/66). Gameplay/determinismo corre contra checkout local NO-DRIFT (HEAD==origin==16905d9, byte-idéntico a lo servido); ck18 verifica los BYTES SERVIDOS.
// (A) EJE FRESCO = CUADRILLA/CO-KILL = K = nº de JUGADORES DISTINTOS VIVOS ACREDITADOS con un golpe-de-gracia/remate (kill-credit) DENTRO DEL RADIO COMPARTIDO del héroe (OUTPUT — quién REMATA), ⊥ #137 COHORTE (PRESENTES) y ⊥ #136 CÓNCLAVE (ENGANCHADOS) y ⊥ #62 FOCUS_FIRE (APUNTAR al mismo objetivo). CONTEO CRUDO de killers acreditados, NO fracción (#123 cov/P). SNAPSHOT PURO (lee el kill-credit ya replicado, SIN buffer temporal). 🔑 DETERMINISMO (sev-1): K=cuenta ENTERA de killers acreditados vs umbrales ENTEROS {midAssist2,hiAssist3} ⇒ 0-float en el score/decisión. Bandas sobre K: ≥hiAssist(3) ⇒ assist-pleno ⇒ 2; ≥midAssist(2) ⇒ assist-parcial ⇒ 1; <2 (solitario) ⇒ 0. 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ K=1 ⇒ 0 (colapso LIMPIO, IMPOSIBLE en solitario).
// (B) CANAL FRESCO = coKillFind (fichas de cuadrilla por rematar con la cuadrilla ACREDITADA — NINGUNO de los 79 flags lo usa). Moneda FRESCA (h.coKillBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — CUADRILLA = OUTPUT/CO-KILL (quién REMATA) ⊥ TODOS los priores: ⊥#137 COHORTE (PRESENTES): {4 presentes,1 rematando} ⇒ COHORTE R4/w2 pero CUADRILLA K1/0; ⊥#136 CÓNCLAVE (ENGANCHADOS): {2 enganchados,1 rematando} ⇒ CÓNCLAVE F2/w1 pero CUADRILLA K1/0 (tank engaged 0-kills); {1 enganchado,2 rematando} ⇒ CÓNCLAVE F1/0 pero CUADRILLA K2/w1 (ranged no-enganchado landea el golpe); ⊥#62 FOCUS_FIRE (APUNTAR al mismo objetivo, passive): 3 presentes+atacando pero 0 kills landeados ⇒ CUADRILLA K0; los MISMOS 3 con kills COMPLETADOS ⇒ K3.
//
// Run: node tools/cas2806-cokill-live-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE_BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2806");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// hitProbe LUT esperada: (credited=nº killers acreditados en radio, players=P gate)→K=clamp(credited,0,P)→banda(K vs {midAssist2,hiAssist3,minPlayers2} ENTEROS)→{weight,rankTier}. UMBRALES hiAssist 3 / midAssist 2 + colapso single-player (K<minPlayers2 ⇒ 0).
const EXPECT_HIT = [
  { name: "solo-P1",           credited: 1, players: 1, K: 1, w: 0 },   // single-player: K1<midAssist ⇒ 0 (colapso LIMPIO)
  { name: "duo-P2",            credited: 2, players: 2, K: 2, w: 1 },   // 2 killers ⇒ K2 ⇒ 1
  { name: "duo-of-4",          credited: 2, players: 4, K: 2, w: 1 },   // 🔑 2 killers DE un roster de 4 ⇒ K2 (conteo CRUDO, ⊥ CONTEST fracción 2/4)
  { name: "trio-P3",           credited: 3, players: 3, K: 3, w: 2 },   // 3 killers ⇒ K3 ⇒ 2
  { name: "trio-of-4",         credited: 3, players: 4, K: 3, w: 2 },   // K3 de P4 ⇒ 2
  { name: "full-P4",           credited: 4, players: 4, K: 4, w: 2 },   // 4 killers ⇒ K4 ⇒ 2
  { name: "one-killer-P3",     credited: 1, players: 3, K: 1, w: 0 },   // 🔑 sólo 1 acreditó el remate de un roster de 3 (el resto presentes pero 0 kills) ⇒ K1 ⇒ 0
  { name: "clamp-overflow",    credited: 9, players: 3, K: 3, w: 2 },   // credited>P se clampa a P=3 ⇒ K3 ⇒ 2
];
// driveHits REAL: inyecta roster sintético (P jugadores con offset {dx,dy}, opcional dead/kill) ⇒ K server-auth = # ACREDITADOS (kill=true) VIVOS DENTRO del radio. Requiere ≥minPlayers(2) acreditados para banda.
// filas: [dx, dy, dead, kill]
const EXPECT_DRIVE = [
  { name: "duo-killers",       players: [[0, 0, false, true], [44, 0, false, true]],                      K: 2, w: 1 },   // 2 acreditados en radio ⇒ K2
  { name: "solo-killer",       players: [[0, 0, false, true]],                                            K: 1, w: 0 },   // 1 ⇒ K1 ⇒ 0
  { name: "trio-killers",      players: [[0, 0, false, true], [44, 0, false, true], [0, 44, false, true]], K: 3, w: 2 },  // 3 ⇒ K3 ⇒ 2
  { name: "far-excluded",      players: [[0, 0, false, true], [44, 0, false, true], [9999, 0, false, true]], K: 2, w: 1 },// 🔑 3º killer fuera de radio (dx 9999) ⇒ EXCLUIDO ⇒ K2 (RADIO-LOCAL)
  { name: "dead-excluded",     players: [[0, 0, false, true], [44, 0, false, true], [30, 30, true, true]], K: 2, w: 1 },  // 🔑 3º killer MUERTO ⇒ EXCLUIDO ⇒ K2 (ANTI-conteo-de-cadáveres)
  { name: "present-not-credited", players: [[0, 0, false, true], [44, 0, false, true], [30, 30, false, false]], K: 2, w: 1 }, // 🔑 3º PRESENTE en radio pero SIN kill-credit (kill:false) ⇒ EXCLUIDO ⇒ K2 (⊥ #137 COHORTE / #62 FOCUS_FIRE: presente/atacando ≠ acreditado-con-remate)
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coKill && window.__dev.coPresence && window.__dev.coStrike && window.__dev.aggroContest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coKill + peer hooks (coPresence/coStrike/aggroContest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE-ON fresh boot (INVERTED from DARK): CO_KILL_SURGE.enabled TRUE; solo hero fresh boot, sin kills acreditados en radio ⇒ K≤1 < midAssist2 ⇒ el SCORE/DECISIÓN colapsan LIMPIO (tier/score/assist/charge/preview=0, se ilumina sólo con ≥2 killers acreditados). Multijugador-nativo: IMPOSIBLE dispararse en solitario. channel fresco coKillFind + tag vacío. 🔑 NO asertamos gExists/partyExists (con enabled:true las estructuras transitorias PUEDEN materializarse — aserta el COLAPSO DE DECISIÓN, no la existencia).
  const dark = await page.evaluate(() => window.__dev.coKill());
  ok("2 LIVE-ON (fresh solo boot): CO_KILL_SURGE.enabled TRUE AND sin cuadrilla acreditada (K≤1) ⇒ score/tier/assist/charge/preview colapsan LIMPIO a 0 AND channel coKillFind AND tag vacío",
     dark.enabled === true && dark.tier === 0 && dark.score === 0 && dark.assist <= 1 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coKillFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} assist=${dark.assist} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiAssist=${dark.hiAssist} midAssist=${dark.midAssist} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no coKillFind/coKillBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coKillFind|coKillBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coKillBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'coKillFind'/'coKillBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coKill({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coKill({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ hitProbe LUT: (credited,players)→K=clamp→banda(K vs {2,3} ENTEROS)→tier→charge (UMBRALES hiAssist/midAssist + colapso single-player + clamp).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coKill({ hitProbe: { credited: c.credited, players: c.players } }).hitProbe), EXPECT_HIT);
  const tabOK = EXPECT_HIT.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].assist === c.K);
  ok("5 ★ hitProbe LUT (CUADRILLA K=#killers acreditados): solo-P1(K1)⇒0, duo(K2)⇒1, duo-of-4(K2)⇒1, trio(K3)⇒2, trio-of-4(K3)⇒2, full(K4)⇒2, one-killer-P3(K1)⇒0, clamp-overflow⇒K3. UMBRAL hiAssist 3/midAssist 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_HIT[i].name, p: x.players, K: x.assist, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH CUADRILLA: driveHits inyecta roster sintético (posiciones + vivo/muerto + kill-credit) ⇒ K REAL server-auth (filtra fuera-de-radio + muertos + NO-acreditados).
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z } = args;
    const mkParty = (rows) => rows.map((r) => ({ dx: r[0], dy: r[1], dead: !!r[2], kill: !!r[3] }));
    window.__dev.coKill({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coKill({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coKill({ driveHits: { players: mkParty(c.players), wipe: true } }).driveHits;
      const live = window.__dev.coKill({ hitProbeLive: true }).hitProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvAssist: dv.assist, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveAssist: live.assist, livePlayers: live.players });
    }
    window.__dev.coKill({ clearHits: true });
    window.__dev.coKill({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvAssist === c.K && comp[i].liveAssist === c.K);
  ok("5c ★ REAL SERVER-AUTH CUADRILLA (kill-credit snapshot): duo-killers(K2)=w1, solo(K1)=w0, trio(K3)=w2, far-excluded(dx9999⇒K2)=w1, dead-excluded(K2)=w1, present-not-credited(kill:false⇒K2)=w1 (filtra RADIO + muertos + NO-acreditados)",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA) ⊥#137 COHORTE (CO-KILL ⊥ PRESENTES): CUADRILLA cuenta KILLERS acreditados, COHORTE cuenta PRESENTES.
  const cruxPres = await page.evaluate(() => {
    const kill = (credited, P) => window.__dev.coKill({ hitProbe: { credited, players: P } }).hitProbe;
    const pres = (present, P) => window.__dev.coPresence({ rosterProbe: { present, players: P } }).rosterProbe;
    // {4 presentes, 1 rematando}: COHORTE R4/w2 vs CUADRILLA K1/w0 (party llena presente, pero sólo uno contribuye kills)
    const A = { kill: kill(1, 4), pres: pres(4, 4) };
    // {2 presentes, 2 rematando}: COHORTE R2/w1 y CUADRILLA K2/w1
    const B = { kill: kill(2, 2), pres: pres(2, 2) };
    return { A, B };
  });
  const cruxPresOK =
    cruxPres.A.pres.rally === 4 && cruxPres.A.pres.weight === 2 && cruxPres.A.kill.assist === 1 && cruxPres.A.kill.weight === 0   // A: PRESENTE 4 ≠ REMATANDO 1, pesos divergen 2 vs 0
    && cruxPres.B.pres.rally === 2 && cruxPres.B.pres.weight === 1 && cruxPres.B.kill.assist === 2 && cruxPres.B.kill.weight === 1;
  ok("6 ★ CRUX (LA CRÍTICA) ⊥#137 COHORTE (CO-KILL ⊥ PRESENTES): {4 presentes,1 rematando} ⇒ COHORTE R4/w2 pero CUADRILLA K1/w0 (party presente que NO contribuye kills); {2 presentes,2 rematando} ⇒ COHORTE R2/w1 y CUADRILLA K2/w1 ⇒ PRESENTE ⊥ CONTRIBUIR (CUADRILLA es el eje de OUTPUT/CO-KILL, COHORTE el de CO-PRESENCIA)",
     cruxPresOK, JSON.stringify(cruxPres));

  // 6b ★ CRUX ⊥#136 CÓNCLAVE (CO-KILL ⊥ ENGANCHADOS): CUADRILLA cuenta KILLERS, CÓNCLAVE cuenta ENGANCHADOS por mob.
  const cruxCon = await page.evaluate(() => {
    const kill = (credited, P) => window.__dev.coKill({ hitProbe: { credited, players: P } }).hitProbe;
    const muster = (tgts, P) => window.__dev.coStrike({ musterProbe: { tgts, players: P } }).musterProbe;
    // {2 enganchados por 2 mobs, 1 rematando}: CÓNCLAVE F2/w1 (tank+dps enganchados) pero CUADRILLA K1/w0 (sólo uno acreditó el remate — el tank landea 0 kills)
    const A = { kill: kill(1, 2), muster: muster([0, 1], 2) };
    // {refriega mínima/sin muster (1 mob ⇒ CÓNCLAVE gated 0), 2 rematando}: CÓNCLAVE w0 pero CUADRILLA K2/w1 (2 ranged NO-enganchados en muster limpian mobs sueltos)
    const B = { kill: kill(2, 2), muster: muster([0], 2) };
    return { A, B };
  });
  const cruxConOK =
    cruxCon.A.muster.muster === 2 && cruxCon.A.muster.weight === 1 && cruxCon.A.kill.assist === 1 && cruxCon.A.kill.weight === 0
    && cruxCon.B.muster.weight === 0 && cruxCon.B.kill.assist === 2 && cruxCon.B.kill.weight === 1;
  ok("6b ★ CRUX ⊥#136 CÓNCLAVE (CO-KILL ⊥ ENGANCHADOS): {2 enganchados,1 rematando} ⇒ CÓNCLAVE F2/w1 pero CUADRILLA K1/w0 (tank enganchado, 0 kills); {refriega sin muster (CÓNCLAVE w0),2 rematando} ⇒ CUADRILLA K2/w1 ⇒ señal-ENGANCHADO ⊥ señal-CONTRIBUIR (pesos divergen en AMBOS sentidos)",
     cruxConOK, JSON.stringify(cruxCon));

  // 6c ★ CRUX ⊥#62 FOCUS_FIRE (CO-KILL COMPLETADO ⊥ APUNTAR-en-progreso): 3 presentes+atacando sin kills ⇒ K0; los MISMOS 3 con kills COMPLETADOS ⇒ K3.
  const cruxFocus = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coKill({ enabled: true });
    window.__dev.coKill({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    // 3 jugadores presentes en radio (focus-fireando un boss) pero NINGUNO ha landeado un remate (kill:false — boss aún vivo) ⇒ CUADRILLA K0/score0
    const focusing = window.__dev.coKill({ driveHits: { players: [{ dx: 0, dy: 0, kill: false }, { dx: 30, dy: 0, kill: false }, { dx: 0, dy: 30, kill: false }], wipe: true } }).driveHits;
    // LOS MISMOS 3 pero ahora cada uno ACREDITADO con un remate COMPLETADO ⇒ CUADRILLA K3/score2
    const killing = window.__dev.coKill({ driveHits: { players: [{ dx: 0, dy: 0, kill: true }, { dx: 30, dy: 0, kill: true }, { dx: 0, dy: 30, kill: true }], wipe: true } }).driveHits;
    window.__dev.coKill({ clearHits: true });
    window.__dev.coKill({ enabled: false });
    return { focusing, killing };
  }, { Z });
  const cruxFocusOK = cruxFocus.focusing.assist === 0 && cruxFocus.focusing.score === 0 && cruxFocus.killing.assist === 3 && cruxFocus.killing.score === 2;
  ok("6c ★ CRUX ⊥#62 FOCUS_FIRE (COMPLETADO ⊥ APUNTAR-en-progreso): 3 jugadores PRESENTES+atacando un boss sin morir (0 kills) ⇒ CUADRILLA K0/0; los MISMOS 3 con remates COMPLETADOS/acreditados ⇒ CUADRILLA K3/2 ⇒ CUADRILLA mide el OUTPUT de kills-COMPLETADOS (find-por-kill), NO el aim-en-progreso sobre el mismo objetivo (FOCUS_FIRE, passive goldFind)",
     cruxFocusOK, JSON.stringify(cruxFocus));

  // 6d ★ CRUX ⊥#123 CONTEST (CONTEO CRUDO ⊥ FRACCIÓN cov/P): mismo K con distinta cobertura.
  const cruxContest = await page.evaluate(() => {
    const kill = (credited, P) => window.__dev.coKill({ hitProbe: { credited, players: P } }).hitProbe;
    const full = kill(2, 2);   // 2 de 2: K2, cobertura 1.0
    const half = kill(2, 4);   // 2 de 4: MISMO K2, pero cobertura 0.5
    return { full, half };
  });
  const cruxContestOK = cruxContest.full.assist === 2 && cruxContest.half.assist === 2 && cruxContest.full.weight === 1 && cruxContest.half.weight === 1;
  ok("6d ★ CRUX ⊥#123 CONTEST (CONTEO ⊥ FRACCIÓN): {2 de 2}(cov 1.0) vs {2 de 4}(cov 0.5) ⇒ MISMO CUADRILLA K2/w1 (conteo CRUDO de killers, INVARIANTE a la cobertura fraccional)",
     cruxContestOK, JSON.stringify(cruxContest));

  // 7 ★ K-SENSITIVITY / RADIO-FILTER: más killers acreditados DENTRO del radio ⇒ K sube; los de fuera no cuentan.
  const kSens = await page.evaluate(() => {
    const t = (credited, P) => { const m = window.__dev.coKill({ hitProbe: { credited, players: P } }).hitProbe; return { K: m.assist, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), full: t(4, 4) };
  });
  const kSensOK = kSens.duo.K === 2 && kSens.trio.K === 3 && kSens.full.K === 4 && kSens.duo.w === 1 && kSens.trio.w === 2 && kSens.full.w === 2;
  ok("7 ★ K-SENSITIVITY (K sube con más killers ACREDITADOS): 2⇒K2/w1, 3⇒K3/w2, 4⇒K4/w2 (CUADRILLA mide el tamaño CRUDO de la cuadrilla acreditada)",
     kSensOK, JSON.stringify(kSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: SIN party (K=1) ⇒ 0; CON party de killers (K≥2) ⇒ >0.
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coKill({ enabled: true });
    const drive = (rows) => { window.__dev.coKill({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coKill({ driveHits: { players: rows.map(r => ({ dx: r[0], dy: r[1], kill: true })), wipe: true } }).driveHits;
      const live = window.__dev.coKill({ hitProbeLive: true }).hitProbeLive;
      return { idx: dv.idx, assist: dv.assist, score: dv.score, players: live.players }; };
    const sp = drive([[0, 0]]);                        // single-player: K=1 ⇒ 0 (colapso)
    const mp = drive([[0, 0], [44, 0], [0, 44]]);      // multijugador K3 ⇒ score2 (bien-definido)
    window.__dev.coKill({ clearHits: true });
    window.__dev.coKill({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.assist === 1 && degen.sp.score === 0 && degen.mp.assist === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 killer ⇒ K1/score0; 3 killers ⇒ K3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM: dos hitProbe idénticos ⇒ K/w byte-idénticos (conteo ENTERO + banda de umbrales enteros {2,3}, 0-float en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.coKill({ hitProbe: { credited: 3, players: 4 } }).hitProbe;
    const b = window.__dev.coKill({ hitProbe: { credited: 3, players: 4 } }).hitProbe;
    return { a: { K: a.assist, w: a.weight }, b: { K: b.assist, w: b.weight } };
  });
  const detOK = det.a.K === det.b.K && det.a.w === det.b.w && det.a.K === 3;
  ok("9 ★ INTEGER-DETERMINISM: hitProbe repetido ⇒ K/weight byte-idénticos (CONTEO ENTERO de killers + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 10 CANAL coKillFind: forageChargePreview con cuadrilla acreditada >0 ; solitario → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coKill({ enabled: true });
    window.__dev.coKill({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coKill({ driveHits: { players: [{ dx: 0, dy: 0, kill: true }, { dx: 44, dy: 0, kill: true }, { dx: 0, dy: 44, kill: true }], wipe: true } });   // assist-pleno ⇒ score2
    const actVm = window.__dev.coKill();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coKill({ driveHits: { players: [{ dx: 0, dy: 0, kill: true }], wipe: true } });   // solitario (K1) ⇒ score0
    const goVm = window.__dev.coKill();
    window.__dev.coKill({ clearHits: true });
    window.__dev.coKill({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coKillFind: forageChargePreview cuadrilla plena (K≥3) ⇒ charge>0 (==coKillBonus); con solitario (K1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds coKillBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let k = 3; k <= 10; k++) vals.push(window.__dev.coKill({ hitProbe: { credited: k, players: k } }).hitProbe.charge);  // K=k ⇒ w2
    return { max: Math.max(...vals), cap: window.__dev.coKill().cap };
  });
  ok("11 ★ SUB-CAP: ninguna cuadrilla plena produce charge>coKillBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full cuadrilla available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coKill({ enabled: true });
    window.__dev.coKill({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coKill({ driveHits: { players: [{ dx: 0, dy: 0, kill: true }, { dx: 44, dy: 0, kill: true }, { dx: 0, dy: 44, kill: true }], wipe: true } });   // assist-pleno disponible
    window.__dev.coKill({ enabled: false });                          // now OFF
    const off = window.__dev.coKill();
    window.__dev.coKill({ enabled: true }); window.__dev.coKill({ clearHits: true }); window.__dev.coKill({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, assist: off.assist };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.assist === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, coKillBonus(cuadrilla plena disponible)==0 + forageChargePreview==0 + idx==0 + assist==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling coPresence/coStrike/aggroContest no cambia la señal de coKill.
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coKill({ enabled: true });
    window.__dev.coKill({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coKill({ driveHits: { players: [{ dx: 0, dy: 0, kill: true }, { dx: 44, dy: 0, kill: true }, { dx: 0, dy: 44, kill: true }], wipe: true } }).driveHits;
    const snap = () => JSON.stringify({ coPresence: window.__dev.coPresence(), coStrike: window.__dev.coStrike(), aggroContest: window.__dev.aggroContest() });
    const peersOn = snap();
    const cpPrev = window.__dev.coPresence().enabled, csPrev = window.__dev.coStrike().enabled, acPrev = window.__dev.aggroContest().enabled;
    window.__dev.coPresence({ enabled: !cpPrev }); window.__dev.coStrike({ enabled: !csPrev }); window.__dev.aggroContest({ enabled: !acPrev });
    const after = window.__dev.coKill({ hitProbeLive: true }).hitProbeLive;
    window.__dev.coPresence({ enabled: cpPrev }); window.__dev.coStrike({ enabled: csPrev }); window.__dev.aggroContest({ enabled: acPrev });
    const peersRestored = snap();
    window.__dev.coKill({ clearHits: true });
    window.__dev.coKill({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.assist === after.assist;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeAssist: before.assist, afterAssist: after.assist };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD coKillFind ⊥ peers: la señal de cuadrilla (score/assist) NO cambia al togglear CO-PRESENCE #137/CO-STRIKE #136/AGGRO-CONTEST #123; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION CENSUS: served config — 66 `_SURGE` totales, sole-false = CO_KILL (65 true, incl. CO_PRESENCE #137 LIVE).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coPresLive = census.find(([n]) => n === "CO_PRESENCE_SURGE");
  const coKillLive = census.find(([n]) => n === "CO_KILL_SURGE");
  const censusOK = total === 66 && trues === 66 && falses.length === 0 && coKillLive && coKillLive[1] === "true" && coPresLive && coPresLive[1] === "true";
  ok("14 ★ LIVE-ON 0-REGRESIÓN CENSUS (INVERTED): served config 66 `_SURGE` totales, 66 enabled:true, off=[] (CO_KILL_SURGE #138 LIVE + CO_PRESENCE_SURGE #137 LIVE + los 78 priores)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coKill=${coKillLive ? coKillLive[1] : "?"} coPresence=${coPresLive ? coPresLive[1] : "?"}`);

  // 15 render badge "Cuadrilla:" drawn ON+cuadrilla / not OFF + fps. 🔑 label ÚNICO "Cuadrilla:" (⊥ #137 'Cohorte:'/#136 'Cónclave:'/#108 'Falange:').
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const drive = () => window.__dev.coKill({ driveHits: { players: [{ dx: 0, dy: 0, kill: true }, { dx: 44, dy: 0, kill: true }, { dx: 0, dy: 44, kill: true }], wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Cuadrilla:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coKill({ enabled: true });
    window.__dev.coKill({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coKill({ clearHits: true });
    window.__dev.coKill({ enabled: false });
    const enAtOff = window.__dev.coKill().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z });
  ok("15 render badge \"Cuadrilla:\" se DIBUJA ON+cuadrilla (K>0, re-driven cada frame) y NO OFF (K 0) + fps sano (label ÚNICO ⊥ #137 'Cohorte:'/#136 'Cónclave:'/#108 'Falange:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.coKill({ enabled: true }); window.__dev.coKill({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coKill({ driveHits: { players: [{ dx: 0, dy: 0, kill: true }, { dx: 44, dy: 0, kill: true }, { dx: 0, dy: 44, kill: true }], wipe: true } }); }, { Z });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coKill({ clearHits: true }); window.__dev.coKill({ enabled: false }); });

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
    window.__dev.coKill({ enabled: true });
    window.__dev.coKill({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coKill({ driveHits: { players: [{ dx: 0, dy: 0, kill: true }, { dx: 44, dy: 0, kill: true }, { dx: 0, dy: 44, kill: true }], wipe: true } }).driveHits;   // K=3 ⇒ score2
    const vm = window.__dev.coKill();
    const lut = [[2, 2], [3, 3], [1, 1], [4, 4]].map(([credited, P]) => { const m = window.__dev.coKill({ hitProbe: { credited, players: P } }).hitProbe; return { p: m.players, K: m.assist, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coKill({ hitProbeLive: true }).hitProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coKill({ clearHits: true });
    window.__dev.coKill({ enabled: false });
    return { score: dv.score, idx: dv.idx, assist: dv.assist, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveAssist: live.assist, livePlayers: live.players, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.assist === B.assist && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveAssist === B.liveAssist && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMO kill-credit K=3 ⇒ score/idx/assist/players/tier/charge + hitProbeLive(field,assist,players,score) + hitProbe LUT (K enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},assist:${A.assist},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveAssist:${A.liveAssist},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},assist:${B.assist},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveAssist:${B.liveAssist},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.coKill({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coKill({ enabled: false }));

  // 18 ★ SERVED LIVE BUILD (gh-pages, no publish lag): root 200 + version.json == 9527556851d4/815 (NEW ≠ old d2fe18611bd2) + served sim/config.js CO_KILL_SURGE enabled:true + census 66/66 off=[].
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
    const lCoKill = lcensus.find(([n]) => n === "CO_KILL_SURGE");
    const servedOK = rootRes.status === 200 && ver.build === "9527556851d4" && ver.files === 815 && lTotal === 66 && lTrues === 66 && lFalses.length === 0 && lCoKill && lCoKill[1] === "true";
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json 9527556851d4/815 (NEW ≠ old d2fe18611bd2) + served sim/config.js CO_KILL_SURGE enabled:true + census 66/66 off=[]",
       servedOK, `rootStatus=${rootRes.status} build=${ver.build} files=${ver.files} census total=${lTotal} true=${lTrues} false=${JSON.stringify(lFalses)} coKill=${lCoKill ? lCoKill[1] : "?"}`);
  } catch (e) {
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json 9527556851d4/815 + config CO_KILL_SURGE enabled:true", false, `FETCH ERROR ${String(e)}`);
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
